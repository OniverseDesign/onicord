const path = require("path");

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
    const host = hostname.toLowerCase().trim();

    // Common local aliases & special top-level domains
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal") ||
      host === "metadata.google.internal"
    ) {
      return true;
    }

    // IPv6 loopback, link-local, and unique-local prefixes
    if (
      host === "::1" ||
      host === "[::1]" ||
      host.startsWith("fe80:") ||
      host.startsWith("[fe80:") ||
      host.startsWith("fc00:") ||
      host.startsWith("[fc00:") ||
      host.startsWith("fd00:") ||
      host.startsWith("[fd00:")
    ) {
      return true;
    }

    // IPv4 Loopback: 127.0.0.0/8
    if (host.startsWith("127.")) return true;

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
      .replace(/&#x26;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&#8216;/g, "‘")
      .replace(/&#8217;/g, "’")
      .replace(/&#8220;/g, "“")
      .replace(/&#8221;/g, "”")
      .replace(/&#8211;/g, "–")
      .replace(/&#8212;/g, "—")
      .trim();
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

      if (!response.ok) {
        return { ok: false, status: response.status };
      }

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
        return { ok: true, html };
      }

      const fullText = await response.text();
      return { ok: true, html: fullText.slice(0, maxBytes) };
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
        if (!isBrokenCachedPin && !isBrokenCachedMl && !isBrokenCachedYt) {
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

      // === TikTok oEmbed ===
      const isTikTok = hostname.includes("tiktok.com");
      if (isTikTok) {
        try {
          const ttId = this.extractTikTokId(targetUrl);
          const ttController = new AbortController();
          const ttTimer = setTimeout(() => ttController.abort(), 3500);
          const oembedResp = await fetch(
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(targetUrl)}`,
            { signal: ttController.signal }
          ).finally(() => clearTimeout(ttTimer));

          if (oembedResp.ok) {
            const oembedData = await oembedResp.json();
            const embedUrl = ttId ? `https://www.tiktok.com/embed/v2/${ttId}` : null;
            const payloadResult = {
              title: this.decodeHtmlEntities(oembedData.title || oembedData.author_name || "TikTok Video"),
              description: this.decodeHtmlEntities(oembedData.author_name ? `@${oembedData.author_name} on TikTok` : "Watch on TikTok"),
              image: oembedData.thumbnail_url || null,
              video: null,
              audio: null,
              siteName: "TikTok",
              mediaType: "tiktok",
              embedUrl: embedUrl,
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
        } catch {
          console.warn("TikTok oEmbed fetch failed, falling back to direct parse");
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
                this.parseOpenGraphMeta(vxResult.html, urlObj);
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
                this.parseOpenGraphMeta(commResult.html, urlObj);

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

            const { description: pinDesc } = this.parseOpenGraphMeta(pinResult.html, urlObj);

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

      let fetchResult = await this.fetchHtmlWithLimit(fetchUrl, 3500, 512 * 1024, customHeaders);
      if (!fetchResult.ok && isTwitter) {
        fetchResult = await this.fetchHtmlWithLimit(targetUrl, 3500, 512 * 1024, customHeaders);
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

      let { getMeta, title, description, image: rawParsedImage, video, audio, siteName: parsedSiteName } =
        this.parseOpenGraphMeta(fetchResult.html, urlObj);

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

      // Handle Instagram CDN image expiration caching
      if (
        image &&
        (isInstagram ||
          image.includes("cdninstagram.com") ||
          image.includes("fbcdn.net"))
      ) {
        try {
          const imgController = new AbortController();
          const imgTimer = setTimeout(() => imgController.abort(), 2500);
          const imgResp = await fetch(image, {
            signal: imgController.signal,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
            },
          }).finally(() => clearTimeout(imgTimer));

          if (imgResp.ok) {
            const buffer = await imgResp.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const mime = imgResp.headers.get("content-type") || "image/jpeg";
            image = `data:${mime};base64,${base64}`;
          }
        } catch (b64Err) {
          console.warn(
            "⚠️ Error converting Instagram image to base64:",
            b64Err.message
          );
        }
      }

      let siteName = parsedSiteName;
      if (isTwitter || hostname.includes("x.com") || hostname.includes("twitter.com")) {
        siteName = "Twitter / X";
      } else if (isTikTok) {
        siteName = "TikTok";
      } else if (isInstagram) {
        siteName = "Instagram";
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

      const ttId = this.extractTikTokId(targetUrl);
      const igInfo = this.extractInstagramId(targetUrl);

      if (ytId) {
        mediaType = "youtube";
        embedUrl = `https://www.youtube.com/embed/${ytId}`;
        aspectRatio = targetUrl.includes("/shorts/") ? "9:16" : "16:9";
      } else if (ttId) {
        mediaType = "video";
        embedUrl = `https://www.tiktok.com/embed/v2/${ttId}`;
        aspectRatio = "9:16";
      } else if (igInfo) {
        mediaType = "video";
        embedUrl = `https://www.instagram.com/${igInfo.type}/${igInfo.id}/embed`;
        aspectRatio = igInfo.type === "reel" ? "9:16" : "1:1";
      } else if (isTenor) {
        mediaType = "gif";
        aspectRatio = "1:1";
      } else if (video || isTikTok || isInstagram) {
        mediaType = "video";
        aspectRatio = isTikTok || (isInstagram && targetUrl.includes("reel")) ? "9:16" : "16:9";
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
