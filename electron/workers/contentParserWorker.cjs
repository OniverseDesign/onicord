const { parentPort } = require("worker_threads");

function decodeHtmlEntities(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (full, hex) => {
      try {
        const cp = parseInt(hex, 16);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
      } catch {
        return full;
      }
    })
    .replace(/&#(\d+);/g, (full, dec) => {
      try {
        const cp = parseInt(dec, 10);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
      } catch {
        return full;
      }
    })
    .trim();
}

function parseOpenGraphMeta({ html, hostname }) {
  const metaMap = new Map();
  const metaTagRegex = /<meta\s+([^>]+)>/gi;
  let metaMatch;

  while ((metaMatch = metaTagRegex.exec(html)) !== null) {
    const attrStr = metaMatch[1];
    const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
    const attrs = {};
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
    }
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    const content = attrs.content;
    if (key && content !== undefined) {
      if (!metaMap.has(key)) metaMap.set(key, content);
      const cleanKey = key.replace(/^(og:|twitter:)/, "");
      if (!metaMap.has(cleanKey)) metaMap.set(cleanKey, content);
    }
  }

  const getMeta = (prop) => {
    const p = prop.toLowerCase();
    return metaMap.get(`og:${p}`) || metaMap.get(`twitter:${p}`) || metaMap.get(p) || null;
  };

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const rawTitle = getMeta("title") || titleMatch?.[1] || hostname;
  const rawDesc = getMeta("description") || "Haz clic para abrir este enlace completo...";
  const rawImage = getMeta("image") || getMeta("image:src");
  const rawVideo = getMeta("video") || getMeta("video:secure_url") || getMeta("player:stream");
  const rawAudio = getMeta("audio") || getMeta("audio:secure_url");
  const rawSiteName = getMeta("site_name");

  return {
    metaEntries: Array.from(metaMap.entries()),
    title: decodeHtmlEntities(rawTitle),
    description: decodeHtmlEntities(rawDesc),
    image: rawImage ? decodeHtmlEntities(rawImage) : null,
    video: rawVideo ? decodeHtmlEntities(rawVideo) : null,
    audio: rawAudio ? decodeHtmlEntities(rawAudio) : null,
    siteName: rawSiteName ? decodeHtmlEntities(rawSiteName) : null,
  };
}

function extractXmlTag(block, tagName) {
  const escapedTag = tagName.replace(":", "\\:");
  const regex = new RegExp(`<(?:${escapedTag})[^>]*>([\\s\\S]*?)<\\/(?:${escapedTag})>`, "i");
  const m = block.match(regex);
  if (!m) return "";
  return m[1];
}

function extractXmlAttr(block, tagName, attrName) {
  const escapedTag = tagName.replace(":", "\\:");
  const regex = new RegExp(`<(?:${escapedTag})[^>]*?${attrName}=["']([^"']+)["'][^>]*>`, "i");
  const m = block.match(regex);
  return m ? m[1] : null;
}

function extractImgSrcFromHtml(html) {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function cleanText(str) {
  if (!str || typeof str !== "string") return "";

  let text = str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");

  const decodeEntities = (input) =>
    input
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  text = decodeEntities(text);
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  return text.replace(/\s+/g, " ").trim();
}

function parseJsonFeed({ jsonStr }) {
  const data = JSON.parse(jsonStr);
  const items = [];

  if (data?.data?.children && Array.isArray(data.data.children)) {
    for (const child of data.data.children) {
      const d = child.data;
      if (!d) continue;
      items.push({
        guid: d.id || d.name,
        title: cleanText(d.title),
        link: d.permalink ? `https://reddit.com${d.permalink}` : d.url,
        description: cleanText(d.selftext || d.title),
        pubDate: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
        image:
          d.thumbnail && d.thumbnail.startsWith("http")
            ? d.thumbnail
            : d.url_overridden_by_dest?.match(/\.(jpe?g|png|webp|gif)$/i)
              ? d.url_overridden_by_dest
              : null,
        author: d.author ? `u/${d.author}` : null,
      });
    }
    return items;
  }

  if (Array.isArray(data.items)) {
    for (const it of data.items) {
      items.push({
        guid: it.id || it.url,
        title: cleanText(it.title),
        link: it.url,
        description: cleanText(it.content_text || it.summary || it.content_html),
        pubDate: it.date_published || it.date_modified,
        image: it.image || it.banner_image,
        author: it.author?.name || null,
      });
    }
  }

  return items;
}

function parseXmlFeed({ xmlStr }) {
  const items = [];
  if (!xmlStr || typeof xmlStr !== "string") return items;

  const isAtom = xmlStr.includes("<feed") && xmlStr.includes("<entry");

  if (isAtom) {
    const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
    let match;
    while ((match = entryRegex.exec(xmlStr)) !== null) {
      const entryBlock = match[0];
      const title = extractXmlTag(entryBlock, "title");
      let link = extractXmlAttr(entryBlock, "link", "href");
      if (!link) link = extractXmlTag(entryBlock, "link");
      const guid = extractXmlTag(entryBlock, "id") || link || title;
      const summary = extractXmlTag(entryBlock, "summary") || extractXmlTag(entryBlock, "content");
      const pubDate = extractXmlTag(entryBlock, "published") || extractXmlTag(entryBlock, "updated");
      const author = extractXmlTag(entryBlock, "name");

      let image =
        extractXmlAttr(entryBlock, "media:thumbnail", "url") ||
        extractXmlAttr(entryBlock, "media:content", "url");
      if (!image) image = extractImgSrcFromHtml(summary);

      if (title || link) {
        items.push({
          guid: cleanText(guid),
          title: cleanText(title),
          link: link ? link.trim() : "",
          description: cleanText(summary),
          pubDate: pubDate ? new Date(pubDate).toISOString() : null,
          image: image ? image.trim() : null,
          author: author ? cleanText(author) : null,
        });
      }
    }
    return items;
  }

  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xmlStr)) !== null) {
    const itemBlock = match[0];
    const title = extractXmlTag(itemBlock, "title");
    const link = extractXmlTag(itemBlock, "link");
    const guid = extractXmlTag(itemBlock, "guid") || link || title;
    const description =
      extractXmlTag(itemBlock, "description") || extractXmlTag(itemBlock, "content:encoded");
    const pubDate = extractXmlTag(itemBlock, "pubDate");
    const author = extractXmlTag(itemBlock, "dc:creator") || extractXmlTag(itemBlock, "author");

    let image =
      extractXmlAttr(itemBlock, "enclosure", "url") ||
      extractXmlAttr(itemBlock, "media:content", "url") ||
      extractXmlAttr(itemBlock, "media:thumbnail", "url");
    if (!image) image = extractImgSrcFromHtml(description);

    if (title || link) {
      items.push({
        guid: cleanText(guid),
        title: cleanText(title),
        link: link ? link.trim() : "",
        description: cleanText(description),
        pubDate: pubDate ? new Date(pubDate).toISOString() : null,
        image: image ? image.trim() : null,
        author: author ? cleanText(author) : null,
      });
    }
  }

  return items;
}

if (parentPort) {
  parentPort.on("message", (msg) => {
    if (!msg || !msg.id) return;
    try {
      let result;
      if (msg.op === "parseOpenGraph") {
        result = parseOpenGraphMeta(msg);
      } else if (msg.op === "parseXmlFeed") {
        result = parseXmlFeed(msg);
      } else if (msg.op === "parseJsonFeed") {
        result = parseJsonFeed(msg);
      } else {
        throw new Error(`Unknown contentParserWorker op: ${msg.op}`);
      }
      parentPort.postMessage({ id: msg.id, result });
    } catch (err) {
      parentPort.postMessage({ id: msg.id, error: err?.message || String(err) });
    }
  });
}
