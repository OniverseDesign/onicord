const path = require("path");
const { IdleWorkerPool } = require("../workers/workerRunner.cjs");

const parserPool = new IdleWorkerPool("contentParserWorker.cjs", { idleTimeoutMs: 60_000 });

class OpenGraphService {
  constructor() {
    this.ogCacheMap = new Map();
    this.CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  }

  extractYouTubeId(urlStr) {
    try {
      const u = new URL(urlStr);
      const host = u.hostname.toLowerCase();
      if (!host.includes("youtube.com") && !host.includes("youtu.be")) return null;
      if (host.includes("youtu.be")) {
        return u.pathname.slice(1).split("/")[0].split("?")[0];
      }
      if (u.pathname.includes("/shorts/")) {
        return u.pathname.split("/shorts/")[1]?.split("/")[0]?.split("?")[0];
      }
      if (u.pathname.includes("/embed/")) {
        return u.pathname.split("/embed/")[1]?.split("/")[0]?.split("?")[0];
      }
      if (u.pathname.includes("/v/")) {
        return u.pathname.split("/v/")[1]?.split("/")[0]?.split("?")[0];
      }
      if (u.pathname.includes("/live/")) {
        return u.pathname.split("/live/")[1]?.split("/")[0]?.split("?")[0];
      }
      return u.searchParams.get("v");
    } catch {
      return null;
    }
  }

  extractTikTokId(urlStr) {
    if (!urlStr || typeof urlStr !== "string") return null;
    try {
      const u = new URL(urlStr);
      if (!u.hostname.includes("tiktok.com")) return null;
      const match = u.pathname.match(/\/video\/(\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  extractInstagramId(urlStr) {
    if (!urlStr || typeof urlStr !== "string") return null;
    try {
      const u = new URL(urlStr);
      if (!u.hostname.includes("instagram.com")) return null;
      const match = u.pathname.match(/\/(reel|reels|p)\/([^/]+)/);
      if (match) {
        const type = match[1] === "p" ? "p" : "reel";
        return { type, id: match[2] };
      }
      return null;
    } catch {
      return null;
    }
  }

  isPrivateOrBlockedHost(hostname) {
    if (!hostname || typeof hostname !== "string") return true;
    const rawHost = hostname.toLowerCase().trim();
    const host = rawHost.replace(/^\[|\]$/g, "");

    // Common local aliases & special top-level domains
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::" ||
      host === "0:0:0:0:0:0:0:0" ||
      host === "0:0:0:0:0:0:0:1" ||
      host.endsWith(".local") ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal") ||
      host === "metadata.google.internal"
    ) {
      return true;
    }

    // IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1, ::ffff:10.0.0.1, ::ffff:192.168.1.1, ::ffff:7f00:1)
    if (
      host.startsWith("::ffff:127.") ||
      host.startsWith("::ffff:10.") ||
      host.startsWith("::ffff:192.168.") ||
      host.startsWith("::ffff:169.254.") ||
      host.startsWith("::ffff:0.") ||
      host.startsWith("::ffff:7f") ||
      host.startsWith("::ffff:a00:") ||
      host.startsWith("::ffff:c0a8:") ||
      host.startsWith("::ffff:a9fe:")
    ) {
      return true;
    }
    if (host.startsWith("::ffff:")) {
      const mappedPart = host.slice(7);
      if (this.isPrivateOrBlockedHost(mappedPart)) return true;
    }

    // IPv6 loopback, link-local, and unique-local prefixes
    if (
      host === "::1" ||
      rawHost === "[::1]" ||
      host.startsWith("fe80:") ||
      host.startsWith("fc00:") ||
      host.startsWith("fd00:")
    ) {
      return true;
    }

    // IPv4 Loopback: 127.0.0.0/8 or 0.0.0.0/8
    if (host.startsWith("127.") || host.startsWith("0.")) return true;

    // IPv4 Private Networks
    // 10.0.0.0/8
    if (host.startsWith("10.")) return true;
    // 192.168.0.0/16
    if (host.startsWith("192.168.")) return true;
    // 169.254.0.0/16 (Link-Local & Cloud Metadata 169.254.169.254)
    if (host.startsWith("169.254.")) return true;

    // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
    const classBMatch = host.match(/^172\.(\d{1,3})\./);
    if (classBMatch) {
      const octet = parseInt(classBMatch[1], 10);
      if (octet >= 16 && octet <= 31) return true;
    }

    // Decimal / Hex numeric IP bypass representations
    if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
      return true;
    }

    return false;
  }

  decodeHtmlEntities(str) {
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

  async inlineImageAsDataUrl(imageUrl, customHeaders = {}) {
    if (!imageUrl || typeof imageUrl !== "string" || imageUrl.startsWith("data:")) {
      return imageUrl;
    }
    try {
      const parsed = new URL(imageUrl);
      if (
        (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
        this.isPrivateOrBlockedHost(parsed.hostname)
      ) {
        return imageUrl;
      }
    } catch {
      return imageUrl;
    }

    try {
      const imgController = new AbortController();
      const imgTimer = setTimeout(() => imgController.abort(), 3500);
      const imgResp = await fetch(imageUrl, {
        signal: imgController.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
          ...customHeaders,
        },
      }).finally(() => clearTimeout(imgTimer));

      if (!imgResp.ok) return imageUrl;
      const mime = (imgResp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!mime.startsWith("image/")) return imageUrl;

      const buffer = await imgResp.arrayBuffer();
      if (!buffer || buffer.byteLength === 0 || buffer.byteLength > 3 * 1024 * 1024) {
        return imageUrl;
      }
      const base64 = Buffer.from(buffer).toString("base64");
      return `data:${mime};base64,${base64}`;
    } catch (err) {
      console.warn("⚠️ Error converting OpenGraph image to base64:", err.message);
      return imageUrl;
    }
  }

  async fetchHtmlWithLimit(url, timeoutMs = 3500, maxBytes = 512 * 1024, customHeaders = {}, stopAtHead = true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        ...customHeaders,
      };

      const response = await fetch(url, {
        signal: controller.signal,
        headers,
        redirect: "follow",
      });

      if (response.url) {
        try {
          const finalUrlObj = new URL(response.url);
          if (
            (finalUrlObj.protocol !== "https:" && finalUrlObj.protocol !== "http:") ||
            this.isPrivateOrBlockedHost(finalUrlObj.hostname)
          ) {
            return { ok: false, status: 403 };
          }
        } catch {
          return { ok: false, status: 400 };
        }
      }

      if (!response.ok) {
        return { ok: false, status: response.status };
      }

      const finalUrl = response.url || url;

      if (response.body && typeof response.body.getReader === "function") {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: false });
        let html = "";
        let totalBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.byteLength;
            html += decoder.decode(value, { stream: true });
            if (totalBytes >= maxBytes || (stopAtHead && html.includes("</head>"))) {
              try { await reader.cancel(); } catch {}
              break;
            }
          }
        }
        return { ok: true, html, finalUrl };
      }

      const fullText = await response.text();
      return { ok: true, html: fullText.slice(0, maxBytes), finalUrl };
    } finally {
      clearTimeout(timer);
    }
  }

  parseOpenGraphMeta(html, urlObj) {
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
    const rawTitle = getMeta("title") || titleMatch?.[1] || urlObj.hostname;
    const rawDesc = getMeta("description") || "Haz clic para abrir este enlace completo...";
    const rawImage = getMeta("image") || getMeta("image:src");
    const rawVideo = getMeta("video") || getMeta("video:secure_url") || getMeta("player:stream");
    const rawAudio = getMeta("audio") || getMeta("audio:secure_url");
    const rawSiteName = getMeta("site_name");

    return {
      getMeta,
      title: this.decodeHtmlEntities(rawTitle),
      description: this.decodeHtmlEntities(rawDesc),
      image: rawImage ? this.decodeHtmlEntities(rawImage) : null,
      video: rawVideo ? this.decodeHtmlEntities(rawVideo) : null,
      audio: rawAudio ? this.decodeHtmlEntities(rawAudio) : null,
      siteName: rawSiteName ? this.decodeHtmlEntities(rawSiteName) : null,
    };
  }

  async parseOpenGraphMetaAsync(html, urlObj) {
    try {
      const res = await parserPool.run({
        op: "parseOpenGraph",
        html,
        hostname: urlObj.hostname,
      });
      const metaMap = new Map(res.metaEntries || []);
      const getMeta = (prop) => {
        const p = prop.toLowerCase();
        return metaMap.get(`og:${p}`) || metaMap.get(`twitter:${p}`) || metaMap.get(p) || null;
      };
      return {
        getMeta,
        title: res.title,
        description: res.description,
        image: res.image,
        video: res.video,
        audio: res.audio,
        siteName: res.siteName,
      };
    } catch {
      return this.parseOpenGraphMeta(html, urlObj);
    }
  }

  async fetchOpenGraph(targetUrl) {
    try {
      if (!targetUrl || typeof targetUrl !== "string") return null;

      let urlObj;
      try {
        urlObj = new URL(targetUrl);
      } catch {
        return { success: false, error: "URL inválida" };
      }

      if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
        return { success: false, error: "Protocolo no permitido" };
      }

      const hostname = urlObj.hostname.toLowerCase();
      if (this.isPrivateOrBlockedHost(hostname)) {
        console.warn("⚠️ OpenGraph fetch bloqueado hacia host local o privado:", targetUrl);
        return { success: false, error: "Hosts locales no permitidos" };
      }

      const cached = this.ogCacheMap.get(targetUrl);
      if (
        cached &&
        cached.data &&
        cached.data.mediaType &&
        Date.now() - cached.timestamp < this.CACHE_TTL_MS
      ) {
        const cachedImg = cached.data.image;
        const isBrokenCachedPin =
          cached.data.mediaType === "pinterest" &&
          (!cachedImg ||
            cachedImg.includes("/originals/") ||
            cachedImg.includes("d53b014d86a6b6761bf649a0ed813c2b"));
        const isBrokenCachedMl =
          hostname.includes("mercadolibre.") &&
          (cached.data.title === "Mercado Libre" || !cached.data.description);
        const isBrokenCachedYt =
          (hostname.includes("youtube.com") || hostname.includes("youtu.be")) &&
          (cached.data.title === "www.youtube.com" ||
            cached.data.title === "YouTube" ||
            !cached.data.image ||
            cached.data.description === "Haz clic para abrir este enlace completo...");
        const isBrokenCachedIg =
          hostname.includes("instagram.com") &&
          (!cachedImg || cached.data.title === "Instagram");
        const isBrokenCachedTt =
          hostname.includes("tiktok.com") &&
          (!cachedImg || cached.data.title === "TikTok Video");
        const isBrokenCachedFb =
          (hostname.includes("facebook.com") ||
            hostname.includes("fb.watch") ||
            hostname.includes("fb.com")) &&
          (!cachedImg || cached.data.success === false);
        if (
          !isBrokenCachedPin &&
          !isBrokenCachedMl &&
          !isBrokenCachedYt &&
          !isBrokenCachedIg &&
          !isBrokenCachedTt &&
          !isBrokenCachedFb
        ) {
          return cached.data;
        }
      }

      // === Direct Media Files Short-Circuit ===
      const pathname = urlObj.pathname.toLowerCase();
      const rawFileName = path.basename(urlObj.pathname).split("?")[0];
      const fileName = decodeURIComponent(rawFileName || "archivo");

      if (pathname.match(/\.(mp4|webm|mov|mkv)$/)) {
        return {
          title: fileName,
          description: "Video",
          image: null,
          video: targetUrl,
          audio: null,
          siteName: "Video",
          mediaType: "video",
          embedUrl: null,
          aspectRatio: "16:9",
          url: targetUrl,
        };
      }
      if (pathname.match(/\.(gif)$/)) {
        return {
          title: fileName,
          description: "GIF animado",
          image: targetUrl,
          video: null,
          audio: null,
          siteName: "GIF",
          mediaType: "gif",
          embedUrl: null,
          aspectRatio: "1:1",
          url: targetUrl,
        };
      }
      if (pathname.match(/\.(png|jpe?g|webp|svg|avif)$/)) {
        return {
          title: fileName,
          description: "Imagen",
          image: targetUrl,
          video: null,
          audio: null,
          siteName: "Imagen",
          mediaType: "image",
          embedUrl: null,
          aspectRatio: "16:9",
          url: targetUrl,
        };
      }
      if (pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/)) {
        return {
          title: fileName,
          description: "Audio",
          image: null,
          video: null,
          audio: targetUrl,
          siteName: "Audio",
          mediaType: "audio",
          embedUrl: null,
          aspectRatio: "16:9",
          url: targetUrl,
        };
      }

      // === YouTube Dedicated oEmbed & High-Res Thumbnails ===
      const ytId = this.extractYouTubeId(targetUrl);
      if (ytId) {
        try {
          const ytController = new AbortController();
          const ytTimer = setTimeout(() => ytController.abort(), 3500);
          const oeUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ytId}`)}&format=json`;
          const ytResp = await fetch(oeUrl, { signal: ytController.signal }).finally(() => clearTimeout(ytTimer));

          let ytTitle = "Video de YouTube";
          let ytAuthor = null;
          let ytThumb = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;

          if (ytResp.ok) {
            const ytData = await ytResp.json();
            if (ytData.title) ytTitle = ytData.title;
            if (ytData.author_name) ytAuthor = ytData.author_name;
            if (ytData.thumbnail_url) ytThumb = ytData.thumbnail_url;
          }

          const isShort = targetUrl.includes("/shorts/");
          const payloadResult = {
            title: this.decodeHtmlEntities(ytTitle),
            description: ytAuthor ? this.decodeHtmlEntities(ytAuthor) : "YouTube",
            image: ytThumb,
            video: null,
            audio: null,
            siteName: "YouTube",
            mediaType: "youtube",
            embedUrl: `https://www.youtube.com/embed/${ytId}`,
            aspectRatio: isShort ? "9:16" : "16:9",
            url: targetUrl,
          };

          if (this.ogCacheMap.size >= 200) {
            const firstKey = this.ogCacheMap.keys().next().value;
            this.ogCacheMap.delete(firstKey);
          }
          this.ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
          return payloadResult;
        } catch (ytErr) {
          console.warn("YouTube oEmbed fetch failed, falling back to direct parse:", ytErr.message);
        }
      }

      // === Spotify oEmbed ===
      if (hostname.includes("spotify.com")) {
        try {
          const spotController = new AbortController();
          const spotTimer = setTimeout(() => spotController.abort(), 3500);
          const spotResp = await fetch(
            `https://open.spotify.com/oembed?url=${encodeURIComponent(targetUrl)}`,
            { signal: spotController.signal }
          ).finally(() => clearTimeout(spotTimer));

          if (spotResp.ok) {
            const spotData = await spotResp.json();
            const embedMatch = urlObj.pathname.match(/\/(track|album|playlist|artist|episode)\/([a-zA-Z0-9]+)/);
            const embedUrl = embedMatch ? `https://open.spotify.com/embed/${embedMatch[1]}/${embedMatch[2]}` : null;
            const payloadResult = {
              title: this.decodeHtmlEntities(spotData.title || "Spotify"),
              description: "Escuchar en Spotify",
              image: spotData.thumbnail_url || null,
              video: null,
              audio: null,
              siteName: "Spotify",
              mediaType: "spotify",
              embedUrl,
              aspectRatio: "16:9",
              url: targetUrl,
            };
            if (this.ogCacheMap.size >= 200) {
              const firstKey = this.ogCacheMap.keys().next().value;
              this.ogCacheMap.delete(firstKey);
            }
            this.ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
            return payloadResult;
          }
        } catch (spotErr) {
          console.warn("Spotify oEmbed fetch failed, falling back to direct parse:", spotErr.message);
        }
      }

      // === GIPHY oEmbed ===
      if (hostname.includes("giphy.com")) {
        try {
          const gController = new AbortController();
          const gTimer = setTimeout(() => gController.abort(), 3500);
          const gResp = await fetch(
            `https://giphy.com/services/oembed?url=${encodeURIComponent(targetUrl)}`,
            { signal: gController.signal }
          ).finally(() => clearTimeout(gTimer));

          if (gResp.ok) {
            const gData = await gResp.json();
            const isVert = gData.width && gData.height && gData.width / gData.height < 0.8;
            const payloadResult = {
              title: this.decodeHtmlEntities(gData.title || "GIPHY"),
              description: "GIF de GIPHY",
              image: gData.url || null,
              video: null,
              audio: null,
              siteName: "GIPHY",
              mediaType: "gif",
              embedUrl: null,
              aspectRatio: isVert ? "9:16" : "16:9",
              url: targetUrl,
            };
            if (this.ogCacheMap.size >= 200) {
              const firstKey = this.ogCacheMap.keys().next().value;
              this.ogCacheMap.delete(firstKey);
            }
            this.ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
            return payloadResult;
          }
        } catch (gErr) {
          console.warn("GIPHY oEmbed failed, falling back to direct parse:", gErr.message);
        }
      }

      // === TikTok (Page OpenGraph via Bot UA + oEmbed Player) ===
      const isTikTok = hostname.includes("tiktok.com");
      if (isTikTok) {
        try {
          const DISCORD_BOT_UA = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";
          const pageResult = await this.fetchHtmlWithLimit(targetUrl, 4500, 512 * 1024, {
            "User-Agent": DISCORD_BOT_UA,
          });

          let ttTitle = null;
          let ttDesc = null;
          let ttImage = null;
          let ttId = this.extractTikTokId(targetUrl) || this.extractTikTokId(pageResult?.finalUrl);

          if (pageResult.ok && pageResult.html) {
            const parsedTt = await this.parseOpenGraphMetaAsync(pageResult.html, urlObj);
            if (parsedTt.title && parsedTt.title !== urlObj.hostname && parsedTt.title !== "TikTok") {
              ttTitle = parsedTt.title;
            }
            if (
              parsedTt.description &&
              parsedTt.description !== "Haz clic para abrir este enlace completo..."
            ) {
              ttDesc = parsedTt.description;
            }
            if (parsedTt.image) {
              ttImage = parsedTt.image;
            }
            if (!ttId) {
              const larkIframe = parsedTt.getMeta?.("lark:url:video_iframe_url");
              ttId =
                this.extractTikTokId(larkIframe) ||
                larkIframe?.match(/\/(\d+)(?:\?|$)/)?.[1] ||
                null;
            }
          }

          let oembedIframeSrc = null;
          try {
            const ttController = new AbortController();
            const ttTimer = setTimeout(() => ttController.abort(), 3000);
            const cleanUrlForOembed = pageResult?.finalUrl || targetUrl;
            const oembedResp = await fetch(
              `https://www.tiktok.com/oembed?url=${encodeURIComponent(cleanUrlForOembed)}`,
              { signal: ttController.signal },
            ).finally(() => clearTimeout(ttTimer));

            if (oembedResp.ok) {
              const oembedData = await oembedResp.json();
              const srcMatch = typeof oembedData.html === "string"
                ? oembedData.html.match(/src=["']([^"']+)["']/i)
                : null;
              if (srcMatch?.[1]) {
                try {
                  const playerUrl = new URL(this.decodeHtmlEntities(srcMatch[1]));
                  playerUrl.searchParams.delete("muted");
                  playerUrl.searchParams.set("autoplay", "1");
                  oembedIframeSrc = playerUrl.toString();
                } catch {}
              }
              if (!ttId && oembedData.embed_product_id) {
                ttId = String(oembedData.embed_product_id);
              }
              if (!ttTitle && typeof oembedData.title === "string" && oembedData.title.trim()) {
                ttTitle = this.decodeHtmlEntities(oembedData.title);
              }
              if (!ttDesc && typeof oembedData.author_name === "string" && oembedData.author_name.trim()) {
                ttDesc = `@${this.decodeHtmlEntities(oembedData.author_name)} en TikTok`;
              }
              if (!ttImage && typeof oembedData.thumbnail_url === "string" && oembedData.thumbnail_url.trim()) {
                ttImage = oembedData.thumbnail_url;
              }
            }
          } catch {}

          const embedUrl =
            oembedIframeSrc ||
            (ttId
              ? `https://www.tiktok.com/player/v1/${ttId}?embed_from=oembed&music_info=1&description=1&autoplay=1`
              : null);

          if (!ttDesc || ttDesc === "Haz clic para abrir este enlace completo...") {
            let handle = null;
            try {
              const finalObj = new URL(pageResult?.finalUrl || targetUrl);
              handle = finalObj.pathname.match(/\/@([^/]+)/)?.[1] || null;
            } catch {}
            ttDesc = handle ? `@${handle} en TikTok` : "Ver en TikTok";
          }

          if (ttImage) {
            ttImage = await this.inlineImageAsDataUrl(ttImage);
          }

          if (ttImage || embedUrl || ttTitle) {
            const payloadResult = {
              title: ttTitle || "Video de TikTok",
              description: ttDesc,
              image: ttImage || null,
              video: null,
              audio: null,
              siteName: "TikTok",
              mediaType: "tiktok",
              embedUrl,
              aspectRatio: "9:16",
              url: targetUrl,
            };
            if (this.ogCacheMap.size >= 200) {
              const firstKey = this.ogCacheMap.keys().next().value;
              this.ogCacheMap.delete(firstKey);
            }
            this.ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
            return payloadResult;
          }
        } catch (ttErr) {
          console.warn("TikTok OpenGraph fetch failed, falling back to direct parse:", ttErr.message);
        }
      }

      // === Reddit (Posts via vxreddit / Communities directly) ===
      const isReddit = hostname.includes("reddit.com") || hostname.includes("redd.it");
      if (isReddit) {
        const isPost = targetUrl.includes("/comments/") || targetUrl.includes("/s/") || hostname.includes("redd.it");

        if (isPost) {
          try {
            const vxUrl = targetUrl
              .replace(/https?:\/\/(?:www\.)?(?:old\.)?reddit\.com/, "https://vxreddit.com")
              .replace("redd.it", "vxreddit.com");
            const vxResult = await this.fetchHtmlWithLimit(vxUrl, 3500, 512 * 1024, {
              "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0)",
            });
            if (vxResult.ok && vxResult.html) {
              const { title: rTitle, description: rDesc, image: rImg, video: rVid, siteName: rSite } =
                await this.parseOpenGraphMetaAsync(vxResult.html, urlObj);
              if (rTitle && rTitle !== "Reddit" && rTitle !== "vxReddit") {
                const payloadResult = {
                  title: rTitle,
                  description: rDesc && rDesc !== "[deleted]" ? rDesc : "Ver publicación en Reddit",
                  image: rImg,
                  video: rVid,
                  audio: null,
                  siteName: rSite || "Reddit",
                  mediaType: rVid ? "video" : rImg ? "image" : "website",
                  embedUrl: null,
                  aspectRatio: "16:9",
                  url: targetUrl,
                };
                if (this.ogCacheMap.size >= 200) {
                  const firstKey = this.ogCacheMap.keys().next().value;
                  this.ogCacheMap.delete(firstKey);
                }
                this.ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
                return payloadResult;
              }
            }
          } catch (rErr) {
            console.warn("Reddit vxreddit fetch failed, trying oEmbed fallback:", rErr.message);
          }

          try {
            const rController = new AbortController();
            const rTimer = setTimeout(() => rController.abort(), 3000);
            const rResp = await fetch(
              `https://www.reddit.com/oembed?url=${encodeURIComponent(targetUrl)}`,
              { signal: rController.signal }
            ).finally(() => clearTimeout(rTimer));
            if (rResp.ok) {
              const rData = await rResp.json();
              const payloadResult = {
                title: this.decodeHtmlEntities(rData.title || "Publicación de Reddit"),
                description: rData.author_name ? `Publicado por u/${rData.author_name}` : "Reddit",
                image: rData.thumbnail_url || null,
                video: null,
                audio: null,
                siteName: "Reddit",
                mediaType: "website",
                embedUrl: null,
                aspectRatio: "16:9",
                url: targetUrl,
              };
              if (this.ogCacheMap.size >= 200) {
                const firstKey = this.ogCacheMap.keys().next().value;
                this.ogCacheMap.delete(firstKey);
              }
              this.ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
              return payloadResult;
            }
          } catch {}
        } else {
          // Community / Subreddit page (e.g. https://www.reddit.com/r/cs2/)
          try {
            const commResult = await this.fetchHtmlWithLimit(targetUrl, 3500, 512 * 1024, {
              "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0)",
            });
            if (commResult.ok && commResult.html) {
              const { title: cTitle, description: cDesc, image: cImg } =
                await this.parseOpenGraphMetaAsync(commResult.html, urlObj);

              let finalTitle = cTitle;
              if (!finalTitle || finalTitle === "Reddit" || finalTitle === urlObj.hostname) {
                const subMatch = urlObj.pathname.match(/\/r\/([a-zA-Z0-9_]+)/i);
                finalTitle = subMatch ? `r/${subMatch[1]}` : "Comunidad de Reddit";
              }

              const payloadResult = {
                title: this.decodeHtmlEntities(finalTitle),
                description: this.decodeHtmlEntities(cDesc || "Comunidad en Reddit • Haz clic para explorar."),
                image: cImg || "https://www.redditstatic.com/shreddit/assets/favicon/192x192.png",
                video: null,
                audio: null,
                siteName: "Reddit",
                mediaType: "website",
                embedUrl: null,
                aspectRatio: "16:9",
                url: targetUrl,
              };
              if (this.ogCacheMap.size >= 200) {
                const firstKey = this.ogCacheMap.keys().next().value;
                this.ogCacheMap.delete(firstKey);
              }
              this.ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
              return payloadResult;
            }
          } catch (commErr) {
            console.warn("Reddit community fetch failed:", commErr.message);
          }
        }
      }

      // === Pinterest High-Res Pin Extraction ===
      const isPinterest = hostname.includes("pinterest.com") || hostname.includes("pin.it");
      if (isPinterest) {
        try {
          const pinResult = await this.fetchHtmlWithLimit(
            targetUrl,
            4000,
            2 * 1024 * 1024,
            {
              "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
            },
            false // allow reading body to parse __PWS_DATA__ JSON pin images
          );
          if (pinResult.ok && pinResult.html) {
            // Find all pinimg URLs, excluding the CSS Instagram icon (d53b014d86a6b6761bf649a0ed813c2b)
            const pinImgs = [...pinResult.html.matchAll(/https:\/\/i\.pinimg\.com\/(?:originals|736x|1200x|564x)\/([a-zA-Z0-9_\/.-]+?\.(?:jpg|jpeg|png|webp))/gi)]
              .map(m => m[0])
              .filter(img => !img.includes("d53b014d86a6b6761bf649a0ed813c2b"));

            const bestImg = pinImgs.find(i => i.includes("/736x/"))
              || pinImgs.find(i => i.includes("/1200x/"))
              || pinImgs.find(i => i.includes("/564x/"))
              || pinImgs.find(i => i.includes("/originals/"))
              || pinImgs[0]
              || null;

            // Extract real Pin title
            const h1Match = pinResult.html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1];
            const titleTagMatch = pinResult.html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
            const gridTitleMatch = pinResult.html.match(/"grid_title":"([^"]+)"/i)?.[1];
            const jsonTitleMatch = pinResult.html.match(/"title":"([^"]+)"/i)?.[1];

            let title = h1Match || gridTitleMatch || jsonTitleMatch || titleTagMatch;
            if (title) {
              title = title.replace(/\s*\|\s*Pinterest.*$/i, "").replace(/\s*-\s*Pinterest.*$/i, "").trim();
            }

            if (!title || title === "Pinterest" || title === urlObj.hostname) {
              const pathParts = urlObj.pathname.split("/").filter(Boolean);
              const slug = pathParts[pathParts.length - 1];
              if (slug && isNaN(slug)) {
                title = slug.replace(/-+/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
              } else {
                title = "Pin de Pinterest";
              }
            }

            const { description: pinDesc } = await this.parseOpenGraphMetaAsync(pinResult.html, urlObj);

            const payloadResult = {
              title: this.decodeHtmlEntities(title),
              description: pinDesc && !pinDesc.toLowerCase().includes("pinterest") ? pinDesc : "Explorar en Pinterest",
              image: bestImg,
              video: null,
              audio: null,
              siteName: "Pinterest",
              mediaType: "pinterest",
              embedUrl: null,
              aspectRatio: "2:3",
              url: targetUrl,
            };
            if (this.ogCacheMap.size >= 200) {
              const firstKey = this.ogCacheMap.keys().next().value;
              this.ogCacheMap.delete(firstKey);
            }
            this.ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
            return payloadResult;
          }
        } catch (pinErr) {
          console.warn("Pinterest scraper failed:", pinErr.message);
        }
      }

      // === Other Platforms & General OpenGraph Scraper ===
      const isTwitter = hostname.includes("twitter.com") || hostname.includes("x.com");
      const isInstagram = hostname.includes("instagram.com");
      const isFacebook =
        hostname.includes("facebook.com") ||
        hostname.includes("fb.watch") ||
        hostname.includes("fb.com");
      const isYouTube = hostname.includes("youtube.com") || hostname.includes("youtu.be");
      const isSteam = hostname.includes("steampowered.com") || hostname.includes("steamcommunity.com");
      const isGitHub = hostname.includes("github.com");
      const isMercadoLibre = hostname.includes("mercadolibre.") || hostname.includes("mercadolivre.");
      const isTenor = hostname.includes("tenor.com");
      const isTwitch = hostname.includes("twitch.tv");

      let fetchUrl = targetUrl;
      if (isTwitter) {
        fetchUrl = targetUrl
          .replace("://twitter.com", "://fxtwitter.com")
          .replace("://x.com", "://fxtwitter.com");
      }

      const customHeaders = {};
      if (isSteam) {
        customHeaders["Cookie"] = "birthtime=568022401; mature_content=1; lastagecheckage=1-January-1988; wants_mature_content=1";
      }
      if (isInstagram || isFacebook) {
        customHeaders["User-Agent"] =
          "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";
      }

      const requestTimeout = isInstagram || isFacebook ? 4500 : 3500;
      let fetchResult = await this.fetchHtmlWithLimit(fetchUrl, requestTimeout, 512 * 1024, customHeaders);
      if (!fetchResult.ok && isTwitter) {
        fetchResult = await this.fetchHtmlWithLimit(targetUrl, 3500, 512 * 1024, customHeaders);
      }
      if ((!fetchResult.ok || !fetchResult.html) && (isInstagram || isFacebook)) {
        fetchResult = await this.fetchHtmlWithLimit(fetchUrl, 4500, 512 * 1024, {
          ...customHeaders,
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        });
      }

      const isMlBlocked =
        isMercadoLibre &&
        fetchResult.html &&
        (fetchResult.html.includes("suspicious-traffic") ||
          fetchResult.html.includes("account-verification") ||
          fetchResult.html.includes("gz-account-verification"));

      if (!fetchResult.ok || !fetchResult.html || isMlBlocked) {
        // Fallback for Mercado Libre if anti-bot blocked
        if (isMercadoLibre) {
          let mlTitle = "Publicación en Mercado Libre";
          const matchB = urlObj.pathname.match(/\/([a-zA-Z0-9_-]+)\/p\/([A-Z0-9]+)/i);
          if (matchB) {
            mlTitle = matchB[1].replace(/-+/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()).trim();
          } else {
            const matchA = urlObj.pathname.match(/\/([A-Z]{3}-?\d+)-([a-zA-Z0-9_-]+)/i);
            if (matchA) {
              mlTitle = matchA[2]
                .replace(/_[A-Z0-9]+$/i, "")
                .replace(/-+/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase())
                .trim();
            }
          }
          const mlPayload = {
            title: mlTitle,
            description: "Ver producto en Mercado Libre • Consulta precio, cuotas y envíos en la publicación oficial.",
            image: "https://http2.mlstatic.com/ui/navigation/5.19.5/mercadolibre/logo__large_plus.png",
            video: null,
            audio: null,
            siteName: hostname.includes(".br") ? "Mercado Livre" : "Mercado Libre",
            mediaType: "website",
            embedUrl: null,
            aspectRatio: "16:9",
            url: targetUrl,
          };
          this.ogCacheMap.set(targetUrl, { data: mlPayload, timestamp: Date.now() });
          return mlPayload;
        }

        return {
          success: false,
          error: `HTTP status: ${fetchResult.status || 'unknown'}`,
        };
      }

      let parsedMeta = await this.parseOpenGraphMetaAsync(fetchResult.html, urlObj);
      if (isInstagram && parsedMeta.title === "Instagram" && !parsedMeta.image) {
        const igRetry = await this.fetchHtmlWithLimit(fetchUrl, 4500, 512 * 1024, {
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        });
        if (igRetry.ok && igRetry.html) {
          parsedMeta = await this.parseOpenGraphMetaAsync(igRetry.html, urlObj);
        }
      }

      let { getMeta, title, description, image: rawParsedImage, video, audio, siteName: parsedSiteName } =
        parsedMeta;

      let image = rawParsedImage;

      // Special handling for GitHub social preview cards
      if (isGitHub) {
        const ghRepoMatch = urlObj.pathname.match(/^\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/|$)/);
        if (ghRepoMatch) {
          const [, owner, repo] = ghRepoMatch;
          const ignoredOwners = ["settings", "explore", "trending", "marketplace", "features", "pricing", "login", "signup"];
          if (!ignoredOwners.includes(owner.toLowerCase())) {
            if (!image || image.includes("github-logo") || image.includes("opengraph.githubassets.com")) {
              image = `https://opengraph.githubassets.com/1/${owner}/${repo}`;
            }
          }
        } else {
          const ghUserMatch = urlObj.pathname.match(/^\/([a-zA-Z0-9_.-]+)$/);
          if (ghUserMatch && !image) {
            image = `https://avatars.githubusercontent.com/${ghUserMatch[1]}`;
          }
        }
      }

      // Special handling for Mercado Libre product pages
      if (isMercadoLibre) {
        if (!title || title === "Mercado Libre" || title === "Mercado Livre" || title === urlObj.hostname) {
          const matchB = urlObj.pathname.match(/\/([a-zA-Z0-9_-]+)\/p\/([A-Z0-9]+)/i);
          if (matchB) {
            title = matchB[1].replace(/-+/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()).trim();
          } else {
            const matchA = urlObj.pathname.match(/\/([A-Z]{3}-?\d+)-([a-zA-Z0-9_-]+)/i);
            if (matchA) {
              title = matchA[2]
                .replace(/_[A-Z0-9]+$/i, "")
                .replace(/-+/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase())
                .trim();
            }
          }
        }
        if (!image || image.includes("logo_homecom")) {
          image = "https://http2.mlstatic.com/ui/navigation/5.19.5/mercadolibre/logo__large_plus.png";
        }
        if (!description || description.includes("Mercado Libre")) {
          description = "Publicación en Mercado Libre • Haz clic para ver detalles y precio.";
        }
      }

      // Inline signed/expiring CDN images (Instagram, Facebook, TikTok) as data URLs
      if (
        image &&
        (isInstagram ||
          isFacebook ||
          isTikTok ||
          image.includes("cdninstagram.com") ||
          image.includes("fbcdn.net") ||
          image.includes("tiktokcdn") ||
          image.includes("muscdn.com"))
      ) {
        image = await this.inlineImageAsDataUrl(image);
      }

      let siteName = parsedSiteName;
      if (isTwitter || hostname.includes("x.com") || hostname.includes("twitter.com")) {
        siteName = "Twitter / X";
      } else if (isTikTok) {
        siteName = "TikTok";
      } else if (isInstagram) {
        siteName = "Instagram";
      } else if (isFacebook) {
        siteName = "Facebook";
      } else if (isYouTube) {
        siteName = "YouTube";
      } else if (isSteam) {
        siteName = "Steam";
      } else if (isGitHub) {
        siteName = "GitHub";
      } else if (isMercadoLibre) {
        siteName = hostname.includes(".br") ? "Mercado Livre" : "Mercado Libre";
      } else if (isTenor) {
        siteName = "Tenor";
      } else if (isTwitch) {
        siteName = "Twitch";
      } else if (!siteName) {
        siteName = urlObj.hostname;
      }

      let embedUrl = null;
      let mediaType = "website";
      let aspectRatio = "16:9";

      const ttId = this.extractTikTokId(targetUrl) || this.extractTikTokId(fetchResult?.finalUrl);
      const igInfo = this.extractInstagramId(targetUrl);

      if (ytId) {
        mediaType = "youtube";
        embedUrl = `https://www.youtube.com/embed/${ytId}`;
        aspectRatio = targetUrl.includes("/shorts/") ? "9:16" : "16:9";
      } else if (ttId) {
        mediaType = "tiktok";
        embedUrl = `https://www.tiktok.com/player/v1/${ttId}?embed_from=oembed&music_info=1&description=1&autoplay=1`;
        aspectRatio = "9:16";
      } else if (igInfo) {
        embedUrl = `https://www.instagram.com/${igInfo.type}/${igInfo.id}/embed`;
        if (igInfo.type === "reel" || video) {
          mediaType = "video";
          aspectRatio = "9:16";
        } else {
          mediaType = image ? "image" : "website";
          aspectRatio = "1:1";
        }
      } else if (isFacebook) {
        const isFbVideo =
          Boolean(video) ||
          targetUrl.includes("/reel/") ||
          targetUrl.includes("/share/r/") ||
          targetUrl.includes("/share/v/") ||
          targetUrl.includes("/videos/") ||
          hostname.includes("fb.watch");
        if (isFbVideo) {
          mediaType = "video";
          aspectRatio = targetUrl.includes("/reel/") || targetUrl.includes("/share/r/") ? "9:16" : "16:9";
        } else if (image) {
          mediaType = "image";
        }
      } else if (isTenor) {
        mediaType = "gif";
        aspectRatio = "1:1";
      } else if (video || isTikTok) {
        mediaType = isTikTok ? "tiktok" : "video";
        aspectRatio = isTikTok ? "9:16" : "16:9";
      } else if (isInstagram) {
        mediaType = image ? "image" : "website";
        aspectRatio = "1:1";
      } else if (audio) {
        mediaType = "audio";
      } else if (image) {
        mediaType = "image";
      }

      if (!ytId && !ttId && !igInfo && !isTenor) {
        const metaW = parseInt(
          getMeta("video:width") || getMeta("image:width") || "",
          10,
        );
        const metaH = parseInt(
          getMeta("video:height") || getMeta("image:height") || "",
          10,
        );
        if (metaW && metaH) {
          const ratio = metaW / metaH;
          if (ratio < 0.8) aspectRatio = "9:16";
          else if (ratio >= 0.8 && ratio <= 1.2) aspectRatio = "1:1";
          else aspectRatio = "16:9";
        }
      }

      const payloadResult = {
        title,
        description,
        image,
        video,
        audio,
        siteName,
        mediaType,
        embedUrl,
        aspectRatio,
        url: targetUrl,
      };

      if (this.ogCacheMap.size >= 200) {
        const firstKey = this.ogCacheMap.keys().next().value;
        this.ogCacheMap.delete(firstKey);
      }
      this.ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });

      console.log(
        `🚀 [OG Scanner Send] Metadata ready for "${payloadResult.title}". Type: ${mediaType}, Site: ${siteName}`,
      );
      return payloadResult;
    } catch (err) {
      console.error("💥 [OG Scanner Fatal Error]:", err.message);
      return null;
    }
  }
}

module.exports = new OpenGraphService();
