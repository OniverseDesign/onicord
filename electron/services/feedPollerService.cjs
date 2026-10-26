const fs = require("fs");
const path = require("path");
const { app } = require("electron");

class FeedPollerService {
  constructor() {
    this._intervalTimer = null;
    this._isPolling = false;
    this._cacheFilePath = null;
    this._seenGuids = new Map(); // Map<webhookId, Set<guid>>
    this._lastPolled = new Map(); // Map<webhookId, number>
    this._statusMap = new Map(); // Map<webhookId, { lastCheck: number, lastSuccess: number, lastError: string | null, itemCount: number }>
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    try {
      const userData = app ? app.getPath("userData") : process.cwd();
      this._cacheFilePath = path.join(userData, "onicord_feed_cache.json");
      this._loadCache();
    } catch (e) {
      console.warn("[FeedPollerService] Failed to initialize cache path:", e.message);
    }
    this._initialized = true;
  }

  _loadCache() {
    if (!this._cacheFilePath) return;
    try {
      if (fs.existsSync(this._cacheFilePath)) {
        const raw = fs.readFileSync(this._cacheFilePath, "utf8");
        const data = JSON.parse(raw);
        if (data && typeof data === "object") {
          for (const [whId, guids] of Object.entries(data)) {
            if (Array.isArray(guids)) {
              this._seenGuids.set(whId, new Set(guids));
            }
          }
        }
      }
    } catch (e) {
      console.warn("[FeedPollerService] Error reading cache file:", e.message);
    }
  }

  _saveCache() {
    if (!this._cacheFilePath) return;
    try {
      const obj = {};
      for (const [whId, set] of this._seenGuids.entries()) {
        obj[whId] = Array.from(set).slice(-100); // Keep last 100 items per webhook
      }
      fs.writeFileSync(this._cacheFilePath, JSON.stringify(obj, null, 2), "utf8");
    } catch (e) {
      console.warn("[FeedPollerService] Error saving cache file:", e.message);
    }
  }

  start() {
    this.init();
    if (this._intervalTimer) return;

    // Check feeds every 25 seconds
    this._intervalTimer = setInterval(() => {
      this.checkAllFeeds().catch((err) => {
        console.error("[FeedPollerService Check Error]:", err.message);
      });
    }, 25000);

    // Initial check after 4 seconds (allows room manager and swarm to boot)
    setTimeout(() => {
      this.checkAllFeeds().catch(() => {});
    }, 4000);

    console.log("[FeedPollerService 📡] Decentralized RSS/Atom P2P poller service started");
  }

  stop() {
    if (this._intervalTimer) {
      clearInterval(this._intervalTimer);
      this._intervalTimer = null;
    }
    this._saveCache();
  }

  /**
   * Deterministic P2P Leader Election
   * Only the connected peer with the lowest lexicographical peerId performs the HTTP fetch.
   */
  isLeaderForRoom(roomCode) {
    if (!global.roomManager) return false;
    const localPeerId = global.roomManager.localPeerId;
    if (!localPeerId) return false;

    const peersMap = global.roomManager.peers;
    const peerIds = peersMap ? Array.from(peersMap.keys()) : [];
    const allPeers = [localPeerId, ...peerIds].filter(Boolean).sort();

    // If local peer is the lowest ID, local peer is the leader!
    return allPeers.length === 0 || allPeers[0] === localPeerId;
  }

  async checkAllFeeds() {
    if (this._isPolling) return;
    if (!global.roomManager || !global.roomManager.roomMetaStore) return;

    this._isPolling = true;
    try {
      // Determine active rooms: rooms map or active roomCode
      const activeRooms = new Set();
      if (global.roomManager.roomCode) {
        activeRooms.add(global.roomManager.roomCode);
      }
      if (global.roomManager.rooms && typeof global.roomManager.rooms.keys === "function") {
        for (const code of global.roomManager.rooms.keys()) {
          activeRooms.add(code);
        }
      }

      for (const roomCode of activeRooms) {
        // Verify leader status before fetching
        if (!this.isLeaderForRoom(roomCode)) {
          continue;
        }

        let webhooks = [];
        try {
          webhooks = await global.roomManager.roomMetaStore.getWebhooks(roomCode, true);
        } catch {
          continue;
        }

        const pullWebhooks = (webhooks || []).filter(
          (w) => w.type === "pull_poller" && w.targetUrl && typeof w.targetUrl === "string"
        );

        for (const wh of pullWebhooks) {
          const now = Date.now();
          const lastPoll = this._lastPolled.get(wh.id) || 0;
          const intervalMs = (wh.intervalSeconds || 300) * 1000;

          if (now - lastPoll >= intervalMs) {
            await this.pollWebhook(roomCode, wh);
          }
        }
      }
    } finally {
      this._isPolling = false;
    }
  }

  async pollWebhook(roomCode, webhook, forcePostLatest = false) {
    const url = webhook.targetUrl;
    if (!url) return { success: false, error: "Missing targetUrl" };

    this._lastPolled.set(webhook.id, Date.now());
    const status = this._statusMap.get(webhook.id) || {
      lastCheck: Date.now(),
      lastSuccess: null,
      lastError: null,
      itemCount: 0,
    };
    status.lastCheck = Date.now();

    try {
      const items = await this.fetchAndParseFeed(url);
      status.itemCount = items.length;
      status.lastSuccess = Date.now();
      status.lastError = null;
      this._statusMap.set(webhook.id, status);

      if (!items || items.length === 0) {
        return { success: true, newItemsCount: 0, message: "No items found in feed" };
      }

      let seen = this._seenGuids.get(webhook.id);
      const isFirstRun = !seen;
      if (isFirstRun) {
        seen = new Set();
        this._seenGuids.set(webhook.id, seen);
      }

      // If it's the very first time this webhook runs and we're not forcing,
      // seed all existing items so we don't spam 50 older items to the channel.
      // But we can post the newest 1 item if forcePostLatest is true.
      if (isFirstRun && !forcePostLatest) {
        for (const item of items) {
          seen.add(item.guid || item.link || item.title);
        }
        this._saveCache();
        console.log(`[FeedPoller 📡] Initialized feed tracking for "${webhook.name}" with ${items.length} items seeded.`);
        return { success: true, newItemsCount: 0, seeded: true };
      }

      // Identify new items
      const newItems = [];
      for (const item of items) {
        const id = item.guid || item.link || item.title;
        if (!id) continue;
        if (!seen.has(id)) {
          newItems.push(item);
        }
      }

      // If forcing test post and no new items, take the latest 1 item to test
      if (newItems.length === 0 && forcePostLatest && items.length > 0) {
        newItems.push(items[0]);
      }

      // Reverse so oldest of the new batch is posted first
      newItems.reverse();

      // Post max 3 new items at a time to prevent flood
      const toPost = newItems.slice(0, 3);
      for (const item of toPost) {
        const id = item.guid || item.link || item.title;
        seen.add(id);

        await this._dispatchFeedItem(roomCode, webhook, item);
      }

      this._saveCache();
      return { success: true, newItemsCount: toPost.length };
    } catch (err) {
      status.lastError = err.message;
      this._statusMap.set(webhook.id, status);
      console.error(`[FeedPoller ❌] Error polling feed for "${webhook.name}":`, err.message);
      return { success: false, error: err.message };
    }
  }

  async _dispatchFeedItem(roomCode, webhook, item) {
    if (!global.roomManager) return;

    const hostname = (() => {
      try {
        return new URL(item.link || webhook.targetUrl).hostname.replace(/^www\./, "");
      } catch {
        return "RSS Feed";
      }
    })();

    // Construct rich Discord/Onicord OpenGraph style embed
    const embed = {
      title: item.title ? item.title.slice(0, 200) : "Nueva publicación",
      description: item.description ? item.description.slice(0, 450) + (item.description.length > 450 ? "..." : "") : "",
      url: item.link || webhook.targetUrl,
      color: 0xC89B3C, // LoL Hextech Gold / Ambient Accent
      author: {
        name: webhook.name || "Onicord Feed",
        icon_url: webhook.avatar || null,
        url: item.link || null,
      },
    };

    if (item.image) {
      embed.image = { url: item.image };
    }

    const content = "";

    const sentMessage = await global.roomManager.sendWebhookMessage({
      roomCode,
      channelId: webhook.channelId || "general",
      webhook,
      content,
      embeds: [embed],
      username: webhook.name,
      avatar_url: webhook.avatar,
    });

    try {
      const cryptoService = require("./cryptoService.cjs");
      const decryptedMsg = {
        ...sentMessage,
        text: cryptoService.decrypt(roomCode, sentMessage.text),
      };
      global.mainWindow?.webContents.send("chat:message", decryptedMsg);
    } catch (e) {}
  }

  async fetchAndParseFeed(targetUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let res;
    try {
      res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Onicord/0.2.0",
          Accept: "application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, */*",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();

    if (contentType.includes("json") || targetUrl.endsWith(".json")) {
      return this.parseJsonFeed(text);
    }

    return this.parseXmlFeed(text);
  }

  parseJsonFeed(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      const items = [];

      // Check Reddit format: { data: { children: [ { data: { ... } } ] } }
      if (data?.data?.children && Array.isArray(data.data.children)) {
        for (const child of data.data.children) {
          const d = child.data;
          if (!d) continue;
          items.push({
            guid: d.id || d.name,
            title: this.cleanText(d.title),
            link: d.permalink ? `https://reddit.com${d.permalink}` : d.url,
            description: this.cleanText(d.selftext || d.title),
            pubDate: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
            image: d.thumbnail && d.thumbnail.startsWith("http") ? d.thumbnail : (d.url_overridden_by_dest?.match(/\.(jpe?g|png|webp|gif)$/i) ? d.url_overridden_by_dest : null),
            author: d.author ? `u/${d.author}` : null,
          });
        }
        return items;
      }

      // Check standard JSON Feed format: { items: [ ... ] }
      if (Array.isArray(data.items)) {
        for (const it of data.items) {
          items.push({
            guid: it.id || it.url,
            title: this.cleanText(it.title),
            link: it.url,
            description: this.cleanText(it.content_text || it.summary || it.content_html),
            pubDate: it.date_published || it.date_modified,
            image: it.image || it.banner_image,
            author: it.author?.name || null,
          });
        }
        return items;
      }

      return items;
    } catch (e) {
      throw new Error("Invalid JSON Feed: " + e.message);
    }
  }

  parseXmlFeed(xmlStr) {
    const items = [];
    if (!xmlStr || typeof xmlStr !== "string") return items;

    // Detect if Atom or RSS
    const isAtom = xmlStr.includes("<feed") && xmlStr.includes("<entry");

    if (isAtom) {
      const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
      let match;
      while ((match = entryRegex.exec(xmlStr)) !== null) {
        const entryBlock = match[0];
        const title = this.extractXmlTag(entryBlock, "title");
        let link = this.extractXmlAttr(entryBlock, "link", "href");
        if (!link) {
          link = this.extractXmlTag(entryBlock, "link");
        }
        const guid = this.extractXmlTag(entryBlock, "id") || link || title;
        const summary = this.extractXmlTag(entryBlock, "summary") || this.extractXmlTag(entryBlock, "content");
        const pubDate = this.extractXmlTag(entryBlock, "published") || this.extractXmlTag(entryBlock, "updated");
        const author = this.extractXmlTag(entryBlock, "name");
        
        let image = this.extractXmlAttr(entryBlock, "media:thumbnail", "url") ||
                    this.extractXmlAttr(entryBlock, "media:content", "url");
        if (!image) {
          image = this.extractImgSrcFromHtml(summary);
        }

        if (title || link) {
          items.push({
            guid: this.cleanText(guid),
            title: this.cleanText(title),
            link: link ? link.trim() : "",
            description: this.cleanText(summary),
            pubDate: pubDate ? new Date(pubDate).toISOString() : null,
            image: image ? image.trim() : null,
            author: author ? this.cleanText(author) : null,
          });
        }
      }
      return items;
    }

    // Default: RSS 2.0 / 1.0 (<item>)
    const itemRegex = /<item[\s\S]*?<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xmlStr)) !== null) {
      const itemBlock = match[0];
      const title = this.extractXmlTag(itemBlock, "title");
      const link = this.extractXmlTag(itemBlock, "link");
      const guid = this.extractXmlTag(itemBlock, "guid") || link || title;
      const description = this.extractXmlTag(itemBlock, "description") || this.extractXmlTag(itemBlock, "content:encoded");
      const pubDate = this.extractXmlTag(itemBlock, "pubDate");
      const author = this.extractXmlTag(itemBlock, "dc:creator") || this.extractXmlTag(itemBlock, "author");

      let image = this.extractXmlAttr(itemBlock, "enclosure", "url") ||
                  this.extractXmlAttr(itemBlock, "media:content", "url") ||
                  this.extractXmlAttr(itemBlock, "media:thumbnail", "url");
      if (!image) {
        image = this.extractImgSrcFromHtml(description);
      }

      if (title || link) {
        items.push({
          guid: this.cleanText(guid),
          title: this.cleanText(title),
          link: link ? link.trim() : "",
          description: this.cleanText(description),
          pubDate: pubDate ? new Date(pubDate).toISOString() : null,
          image: image ? image.trim() : null,
          author: author ? this.cleanText(author) : null,
        });
      }
    }

    return items;
  }

  extractXmlTag(block, tagName) {
    const escapedTag = tagName.replace(":", "\\:");
    const regex = new RegExp(`<(?:${escapedTag})[^>]*>([\\s\\S]*?)<\\/(?:${escapedTag})>`, "i");
    const m = block.match(regex);
    if (!m) return "";
    return m[1];
  }

  extractXmlAttr(block, tagName, attrName) {
    const escapedTag = tagName.replace(":", "\\:");
    const regex = new RegExp(`<(?:${escapedTag})[^>]*?${attrName}=["']([^"']+)["'][^>]*>`, "i");
    const m = block.match(regex);
    return m ? m[1] : null;
  }

  extractImgSrcFromHtml(html) {
    if (!html) return null;
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return m ? m[1] : null;
  }

  cleanText(str) {
    if (!str || typeof str !== "string") return "";

    let text = str;
    // Unwrap CDATA
    text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");

    // Decode common XML/HTML entities
    const decodeEntities = (input) => {
      return input
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
    };

    // First decode entities (in case HTML was escaped like &lt;p&gt;)
    text = decodeEntities(text);

    // Strip HTML tags
    text = text.replace(/<[^>]+>/g, " ");

    // Decode again for any double-escaped entities
    text = decodeEntities(text);

    // Collapse multiple whitespace
    return text.replace(/\s+/g, " ").trim();
  }

  getStatus(webhookId) {
    return this._statusMap.get(webhookId) || null;
  }
}

module.exports = new FeedPollerService();
