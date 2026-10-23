const { app, ipcMain, shell, Notification, BrowserWindow, nativeImage, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const diagService = require("../../services/diagService.cjs");
const weatherService = require("../../services/weatherService.cjs");

// State for hardware monitors
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = process.hrtime.bigint();

// OpenGraph cache & helpers
const ogCacheMap = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function extractYouTubeId(urlStr) {
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
  } catch (e) {
    return null;
  }
}

function extractTikTokId(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  try {
    const u = new URL(urlStr);
    if (!u.hostname.includes("tiktok.com")) return null;
    const match = u.pathname.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

function extractInstagramId(urlStr) {
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
  } catch (e) {
    return null;
  }
}

function isPrivateOrBlockedHost(hostname) {
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

function decodeHtmlEntities(str) {
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

async function fetchHtmlWithLimit(url, timeoutMs = 3500, maxBytes = 512 * 1024, customHeaders = {}, stopAtHead = true) {
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

function parseOpenGraphMeta(html, urlObj) {
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
    title: decodeHtmlEntities(rawTitle),
    description: decodeHtmlEntities(rawDesc),
    image: rawImage ? decodeHtmlEntities(rawImage) : null,
    video: rawVideo ? decodeHtmlEntities(rawVideo) : null,
    audio: rawAudio ? decodeHtmlEntities(rawAudio) : null,
    siteName: rawSiteName ? decodeHtmlEntities(rawSiteName) : null,
  };
}

function registerSystemDiagHandlers() {
  // === Window controls & OS ===
  ipcMain.on("show-item-in-folder", (event, fullPath) => {
    if (fullPath) {
      shell.showItemInFolder(fullPath);
    }
  });

  ipcMain.on("window:minimize", () => {
    global.mainWindow?.minimize();
  });

  ipcMain.handle("window:isMinimized", () => {
    return global.mainWindow && !global.mainWindow.isDestroyed()
      ? global.mainWindow.isMinimized()
      : false;
  });

  ipcMain.on("window:maximize", () => {
    if (global.mainWindow?.isMaximized()) global.mainWindow.unmaximize();
    else global.mainWindow?.maximize();
  });

  ipcMain.on("window:setFullscreen", (_event, flag) => {
    if (global.mainWindow) {
      global.mainWindow.setFullScreen(flag);
    }
  });

  ipcMain.on("window:close", () => {
    global.mainWindow?.close();
  });

  ipcMain.on("app:update-icon", (_event, dataUrl) => {
    try {
      if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return;
      const img = nativeImage.createFromDataURL(dataUrl);
      if (img.isEmpty()) return;

      global.currentAppIcon = img;

      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.setIcon(img);
      }
      if (global.tray && !global.tray.isDestroyed()) {
        const trayImg = img.resize({ width: 32, height: 32, quality: "best" });
        global.tray.setImage(trayImg);
      }
      if (process.platform === "darwin" && app.dock) {
        app.dock.setIcon(img);
      }
    } catch (err) {
      console.error("[DynamicIcon] Error al actualizar icono:", err);
    }
  });

  ipcMain.on("window:open-external", (_event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        shell.openExternal(url);
      } else {
        console.warn("⚠️ Intento bloqueado de abrir URL no segura:", url);
      }
    } catch (err) {
      console.error("⚠️ URL inválida rechazada:", err);
    }
  });

  function getNotificationIcon() {
    const candidates = [
      path.join(__dirname, "../../../dist/icon.png"),
      path.join(__dirname, "../../../build/icon.png"),
      path.join(__dirname, "../../../public/icon.png"),
      path.join(process.resourcesPath, "icon.png"),
      path.join(process.resourcesPath, "build/icon.png"),
      path.join(process.resourcesPath, "public/icon.png"),
      path.join(app.getAppPath(), "build/icon.png"),
      path.join(app.getAppPath(), "dist/icon.png"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return undefined;
  }

  function displayOSNotification({ title, body, silent = false }) {
    if (!Notification.isSupported()) {
      console.warn("[OS Notification] Notification.isSupported() devolvió false");
      diagService.log("warn", "Console", "[OS Notification] Notification.isSupported() devolvió false");
      return { success: false, reason: "NOT_SUPPORTED" };
    }

    const iconPath = getNotificationIcon();
    const notifOptions = {
      title: title || "Onicord",
      body: body || "",
      silent: Boolean(silent),
    };

    if (iconPath) {
      notifOptions.icon = iconPath;
    }

    const notif = new Notification(notifOptions);

    notif.on("click", () => {
      const mainWindow = global.mainWindow || BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });

    notif.on("failed", (_event, error) => {
      console.error("[OS Notification Failed]", error);
      diagService.log("error", "Console", `[OS Notification Failed] ${error}`);
    });

    notif.show();
    diagService.log("info", "Console", `[OS Notification] Notification displayed: "${title}" - "${body}"`);
    return { success: true };
  }

  ipcMain.on("show-os-notification", (_event, { title, body }) => {
    try {
      displayOSNotification({ title, body });
    } catch (err) {
      console.error("[OS Notification Error]", err);
      diagService.log("error", "Console", `[OS Notification Error] ${err.message}`);
    }
  });

  ipcMain.handle("system:test-notification", async (_event, customData) => {
    try {
      const title = customData?.title || "Onicord";
      const body = customData?.body || "Desktop notifications are working correctly.";
      return displayOSNotification({ title, body });
    } catch (err) {
      console.error("[OS Test Notification Error]", err);
      return { success: false, error: err.message };
    }
  });

  // === Diagnostics ===
  ipcMain.handle("diagnostics:getLocal", async () => {
    return diagService.getLocalLogs();
  });

  ipcMain.handle("diagnostics:clear", async () => {
    diagService.clearLogs();
    return { success: true };
  });

  ipcMain.handle("diagnostics:request", async (_event, peerId) => {
    if (!global.roomManager) return { success: false };
    global.roomManager.requestPeerDiagnostics(peerId);
    return { success: true };
  });

  ipcMain.handle("diagnostics:log", async (_event, level, category, message) => {
    diagService.log(level, category, message);
    return { success: true };
  });

  ipcMain.handle("diagnostics:exportAllUserLogs", async () => {
    try {
      const logsDir = path.join(process.cwd(), "logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const formattedTimestamp = `${dateStr}_${timeStr}`;

      const sanitize = (name) => String(name || "usuario").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");

      const savedFiles = [];

      let auditLog = [];
      try {
        if (global.roomManager?.roomCode && global.roomManager?.roomMetaStore) {
          const meta = await global.roomManager.roomMetaStore.load(global.roomManager.roomCode);
          if (Array.isArray(meta?.auditLog)) {
            auditLog = meta.auditLog.map((entry) => {
              const d = new Date(entry.timestamp || Date.now());
              const p = (n) => String(n).padStart(2, "0");
              const avatar = entry.avatar && entry.avatar.startsWith("data:image") ? `${entry.avatar.slice(0, 40)}...[base64_truncated]` : entry.avatar;
              return {
                ...entry,
                avatar,
                formattedDate: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
              };
            });
          }
        }
      } catch (e) {
        console.warn("[Diag Export] Could not attach audit log:", e.message);
      }

      const localNickname = global.roomManager?.profile?.nickname || "local_user";
      const localFileName = `onidiag_log_${sanitize(localNickname)}_${formattedTimestamp}.json`;
      const localFilePath = path.join(logsDir, localFileName);

      const localPackage = {
        timestamp: Date.now(),
        formattedDate: `${dateStr} ${timeStr.replace(/-/g, ":")}`,
        user: {
          nickname: localNickname,
          id: global.roomManager?.profile?.id || "local",
          isLocal: true,
        },
        environment: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
        },
        auditLog,
        logs: diagService.getLocalLogs(),
      };

      fs.writeFileSync(localFilePath, JSON.stringify(localPackage, null, 2), "utf8");
      savedFiles.push(localFileName);

      if (global.roomManager) {
        const peerResults = await global.roomManager.collectAllPeerLogs(2000);
        for (const peerItem of peerResults) {
          const peerNick = peerItem.nickname || peerItem.peerId || "peer";
          const peerFileName = `onidiag_log_${sanitize(peerNick)}_${formattedTimestamp}.json`;
          const peerFilePath = path.join(logsDir, peerFileName);

          const peerPackage = {
            timestamp: Date.now(),
            formattedDate: `${dateStr} ${timeStr.replace(/-/g, ":")}`,
            user: {
              nickname: peerNick,
              peerId: peerItem.peerId,
              isLocal: false,
            },
            logs: peerItem.logs || [],
          };

          fs.writeFileSync(peerFilePath, JSON.stringify(peerPackage, null, 2), "utf8");
          savedFiles.push(peerFileName);
        }
      }

      return {
        success: true,
        count: savedFiles.length,
        savedFiles,
      };
    } catch (err) {
      console.error("[OniDiag Export Error]:", err);
      return { success: false, error: err.message };
    }
  });

  // === OpenGraph Scanner (Hardened, Anti-SSRF, Tolerant Parser, 3.5s Timeout) ===
  ipcMain.handle("opengraph:fetch", async (_event, targetUrl) => {
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
      if (isPrivateOrBlockedHost(hostname)) {
        console.warn("⚠️ OpenGraph fetch bloqueado hacia host local o privado:", targetUrl);
        return { success: false, error: "Hosts locales no permitidos" };
      }

      const cached = ogCacheMap.get(targetUrl);
      if (
        cached &&
        cached.data &&
        cached.data.mediaType &&
        Date.now() - cached.timestamp < CACHE_TTL_MS
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
      const ytId = extractYouTubeId(targetUrl);
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
            title: decodeHtmlEntities(ytTitle),
            description: ytAuthor ? decodeHtmlEntities(ytAuthor) : "YouTube",
            image: ytThumb,
            video: null,
            audio: null,
            siteName: "YouTube",
            mediaType: "youtube",
            embedUrl: `https://www.youtube.com/embed/${ytId}`,
            aspectRatio: isShort ? "9:16" : "16:9",
            url: targetUrl,
          };

          if (ogCacheMap.size >= 200) {
            const firstKey = ogCacheMap.keys().next().value;
            ogCacheMap.delete(firstKey);
          }
          ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
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
              title: decodeHtmlEntities(spotData.title || "Spotify"),
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
            if (ogCacheMap.size >= 200) {
              const firstKey = ogCacheMap.keys().next().value;
              ogCacheMap.delete(firstKey);
            }
            ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
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
              title: decodeHtmlEntities(gData.title || "GIPHY"),
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
            if (ogCacheMap.size >= 200) {
              const firstKey = ogCacheMap.keys().next().value;
              ogCacheMap.delete(firstKey);
            }
            ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
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
          const ttId = extractTikTokId(targetUrl);
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
              title: decodeHtmlEntities(oembedData.title || oembedData.author_name || "TikTok Video"),
              description: decodeHtmlEntities(oembedData.author_name ? `@${oembedData.author_name} on TikTok` : "Watch on TikTok"),
              image: oembedData.thumbnail_url || null,
              video: null,
              audio: null,
              siteName: "TikTok",
              mediaType: "tiktok",
              embedUrl: embedUrl,
              aspectRatio: "9:16",
              url: targetUrl,
            };
            if (ogCacheMap.size >= 200) {
              const firstKey = ogCacheMap.keys().next().value;
              ogCacheMap.delete(firstKey);
            }
            ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
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
            const vxResult = await fetchHtmlWithLimit(vxUrl, 3500, 512 * 1024, {
              "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0)",
            });
            if (vxResult.ok && vxResult.html) {
              const { title: rTitle, description: rDesc, image: rImg, video: rVid, siteName: rSite } =
                parseOpenGraphMeta(vxResult.html, urlObj);
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
                if (ogCacheMap.size >= 200) {
                  const firstKey = ogCacheMap.keys().next().value;
                  ogCacheMap.delete(firstKey);
                }
                ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
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
                title: decodeHtmlEntities(rData.title || "Publicación de Reddit"),
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
              if (ogCacheMap.size >= 200) {
                const firstKey = ogCacheMap.keys().next().value;
                ogCacheMap.delete(firstKey);
              }
              ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
              return payloadResult;
            }
          } catch {}
        } else {
          // Community / Subreddit page (e.g. https://www.reddit.com/r/cs2/)
          try {
            const commResult = await fetchHtmlWithLimit(targetUrl, 3500, 512 * 1024, {
              "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0)",
            });
            if (commResult.ok && commResult.html) {
              const { title: cTitle, description: cDesc, image: cImg } =
                parseOpenGraphMeta(commResult.html, urlObj);

              let finalTitle = cTitle;
              if (!finalTitle || finalTitle === "Reddit" || finalTitle === urlObj.hostname) {
                const subMatch = urlObj.pathname.match(/\/r\/([a-zA-Z0-9_]+)/i);
                finalTitle = subMatch ? `r/${subMatch[1]}` : "Comunidad de Reddit";
              }

              const payloadResult = {
                title: decodeHtmlEntities(finalTitle),
                description: decodeHtmlEntities(cDesc || "Comunidad en Reddit • Haz clic para explorar."),
                image: cImg || "https://www.redditstatic.com/shreddit/assets/favicon/192x192.png",
                video: null,
                audio: null,
                siteName: "Reddit",
                mediaType: "website",
                embedUrl: null,
                aspectRatio: "16:9",
                url: targetUrl,
              };
              if (ogCacheMap.size >= 200) {
                const firstKey = ogCacheMap.keys().next().value;
                ogCacheMap.delete(firstKey);
              }
              ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
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
          const pinResult = await fetchHtmlWithLimit(
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

            const { description: pinDesc } = parseOpenGraphMeta(pinResult.html, urlObj);

            const payloadResult = {
              title: decodeHtmlEntities(title),
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
            if (ogCacheMap.size >= 200) {
              const firstKey = ogCacheMap.keys().next().value;
              ogCacheMap.delete(firstKey);
            }
            ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });
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

      let fetchResult = await fetchHtmlWithLimit(fetchUrl, 3500, 512 * 1024, customHeaders);
      if (!fetchResult.ok && isTwitter) {
        fetchResult = await fetchHtmlWithLimit(targetUrl, 3500, 512 * 1024, customHeaders);
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
          ogCacheMap.set(targetUrl, { data: mlPayload, timestamp: Date.now() });
          return mlPayload;
        }

        return {
          success: false,
          error: `HTTP status: ${fetchResult.status || 'unknown'}`,
        };
      }

      let { getMeta, title, description, image: rawParsedImage, video, audio, siteName: parsedSiteName } =
        parseOpenGraphMeta(fetchResult.html, urlObj);

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

      const ttId = extractTikTokId(targetUrl);
      const igInfo = extractInstagramId(targetUrl);

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

      if (ogCacheMap.size >= 200) {
        const firstKey = ogCacheMap.keys().next().value;
        ogCacheMap.delete(firstKey);
      }
      ogCacheMap.set(targetUrl, { data: payloadResult, timestamp: Date.now() });

      console.log(
        `🚀 [OG Scanner Send] Metadata ready for "${payloadResult.title}". Type: ${mediaType}, Site: ${siteName}`,
      );
      return payloadResult;
    } catch (err) {
      console.error("💥 [OG Scanner Fatal Error]:", err.message);
      return null;
    }
  });

  // === Hardware & System ===
  ipcMain.handle("hardware:getNetworkSpeed", async () => {
    const swarmBytes = (global.roomManager?.p2pService?.swarm?.connections?.size || 0) * 1024 * 12.5;
    const totalBytes = swarmBytes + global.activeDownloadBytesThisSecond;
    global.activeDownloadBytesThisSecond = 0;

    const speedKbs = totalBytes / 1024;
    if (speedKbs > 1024) {
      return `${(speedKbs / 1024).toFixed(1)} MB/s`;
    }
    return `${speedKbs.toFixed(1)} KB/s`;
  });

  ipcMain.handle("hardware:getRealCPU", async () => {
    const cpus = os.cpus().length || 1;
    const currentUsage = process.cpuUsage();
    const currentTime = process.hrtime.bigint();

    const userDelta = currentUsage.user - lastCpuUsage.user;
    const sysDelta = currentUsage.system - lastCpuUsage.system;
    const cpuDelta = userDelta + sysDelta;
    const timeDelta = Number(currentTime - lastCpuTime) / 1000;

    lastCpuUsage = currentUsage;
    lastCpuTime = currentTime;

    if (timeDelta === 0) return "0.0";

    const cpuPercent = (cpuDelta / timeDelta / cpus) * 100;
    return Math.max(0, Math.min(100, cpuPercent)).toFixed(1);
  });

  ipcMain.handle("hardware:getRealRAM", async () => {
    const mem = process.memoryUsage();
    return `${Math.round(mem.rss / 1024 / 1024)} MB`;
  });

  ipcMain.handle("system:getDiagnostics", async () => {
    let pkg = {};
    try {
      pkg = require("../../package.json");
    } catch (e) {}

    const cpus = os.cpus();
    const cpuModel = cpus && cpus.length > 0 ? cpus[0].model.trim() : "CPU";
    const cpuCores = cpus ? cpus.length : 1;

    let osName = os.type();
    if (osName === "Windows_NT") {
      const releaseParts = os.release().split(".");
      const major = parseInt(releaseParts[0], 10);
      const build = parseInt(releaseParts[2] || "0", 10);
      if (major === 10) {
        osName = build >= 22000 ? "Windows 11" : "Windows 10";
      } else if (major === 6) {
        if (releaseParts[1] === "3") osName = "Windows 8.1";
        else if (releaseParts[1] === "2") osName = "Windows 8";
        else if (releaseParts[1] === "1") osName = "Windows 7";
      }
    } else if (osName === "Darwin") {
      osName = "macOS";
    }

    return {
      app: pkg.name || "onicord",
      version: app.getVersion() || pkg.version || "0.1.0",
      buildType: "Standalone P2P",
      electron: process.versions.electron || "Desconocido",
      chromium: process.versions.chrome || "Desconocido",
      node: process.versions.node || "Desconocido",
      v8: process.versions.v8 || "Desconocido",
      platform: process.platform,
      arch: process.arch,
      osName: `${osName} (${os.release()})`,
      cpuModel,
      cpuCores,
      totalRamGB: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1) + " GB",
      freeRamGB: (os.freemem() / (1024 * 1024 * 1024)).toFixed(1) + " GB",
      processRamMB: Math.round(process.memoryUsage().rss / 1024 / 1024) + " MB",
      hyperswarmVersion: pkg.dependencies?.hyperswarm ? pkg.dependencies.hyperswarm.replace("^", "") : "4.9.0",
      uptimeSeconds: Math.floor(process.uptime()),
    };
  });

  // === Weather ===
  ipcMain.handle("weather:search", async (event, cityName) => {
    return weatherService.search(cityName);
  });
  ipcMain.handle("weather:searchCities", async (event, currentName) => {
    return weatherService.searchCities(currentName);
  });
  ipcMain.handle("weather:loadForecast", async (event, { lat, lon }) => {
    return weatherService.loadForecast(lat, lon);
  });

  // === Game & App Presence ===
  ipcMain.handle("game:get-current", () => {
    const { getCurrentState } = require("../../gameScanner.cjs");
    return getCurrentState();
  });

  async function autoClassifyProgram(filePath, targetPath) {
    const parsedTarget = path.parse(targetPath);
    const parsedFile = path.parse(filePath);
    const exeName = parsedTarget.base;
    const cleanBaseName = parsedFile.ext.toLowerCase() === ".lnk" ? parsedFile.name : parsedTarget.name;

    // 1. Catálogo base oficial games.json
    try {
      const gamesDB = require("../../games.json");
      const inDb = gamesDB.find((g) => g.exe && g.exe.toLowerCase() === exeName.toLowerCase());
      if (inDb) {
        return {
          title: inDb.title || cleanBaseName,
          type: inDb.type || "game",
          cover: inDb.cover || null,
        };
      }
    } catch {}

    // Formatear nombre preliminar limpio
    let candidateTitle = cleanBaseName
      .replace(/[_-]+/g, " ")
      .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
      .trim();
    if (candidateTitle) {
      candidateTitle = candidateTitle.charAt(0).toUpperCase() + candidateTitle.slice(1);
    } else {
      candidateTitle = cleanBaseName;
    }

    // 2. Heurísticas de directorio y nombre
    const lowerPath = targetPath.toLowerCase();
    const lowerExe = exeName.toLowerCase();

    const gameIndicators = [
      "steamapps", "steam", "epic games", "riot games", "ubisoft", "gog galaxy",
      "gog", "juegos", "games", "game", "ea desktop", "origin games", "battlenet",
      "unity", "unreal", "godot"
    ];
    const appIndicators = [
      "adobe", "blender", "studio", "code", "jetbrains", "intellij", "pycharm",
      "webstorm", "rider", "visual studio", "office", "microsoft", "discord",
      "slack", "browser", "chrome", "firefox", "brave", "edge", "opera",
      "notepad", "sublime", "git", "terminal", "obs-studio", "fl studio", "ableton"
    ];

    let detectedType = null;
    if (gameIndicators.some((kw) => lowerPath.includes(kw) || lowerExe.includes(kw))) {
      detectedType = "game";
    } else if (appIndicators.some((kw) => lowerPath.includes(kw) || lowerExe.includes(kw))) {
      detectedType = "app";
    }

    // 3. Consulta rápida y ligera a Wikipedia API
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);
      const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidateTitle)}`;
      const res = await fetch(searchUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Onicord-Presence/0.1.4 (https://github.com/OniverseDesign)" },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const text = `${data.title || ""} ${data.description || ""} ${data.extract || ""}`.toLowerCase();

        const isWikiGame = /\b(video game|videojuego|roguelike|rpg|shooter|gameplay|arcade|action-adventure|platformer)\b/i.test(text);
        const isWikiApp = /\b(software|application|suite|digital audio|editor|compiler|3d computer|utility|development)\b/i.test(text);

        if (isWikiGame) {
          detectedType = "game";
          if (data.title && !data.title.includes("(")) {
            candidateTitle = data.title;
          }
        } else if (isWikiApp) {
          detectedType = "app";
          if (data.title && !data.title.includes("(")) {
            candidateTitle = data.title;
          }
        }
      }
    } catch {}

    if (!detectedType) {
      detectedType = lowerPath.includes("program files") && !lowerPath.includes("game") ? "app" : "game";
    }

    return {
      title: candidateTitle,
      type: detectedType,
      cover: null,
    };
  }

  ipcMain.handle("dialog:openExecutable", async () => {
    const win = BrowserWindow.getFocusedWindow() || global.mainWindow;
    const isWindows = process.platform === "win32";
    const filters = isWindows
      ? [
          { name: "Juegos y Aplicaciones (*.exe, *.lnk)", extensions: ["exe", "lnk"] },
          { name: "Ejecutables (*.exe)", extensions: ["exe"] },
          { name: "Accesos directos (*.lnk)", extensions: ["lnk"] },
          { name: "Todos los archivos", extensions: ["*"] },
        ]
      : [{ name: "Todos los archivos", extensions: ["*"] }];

    const result = await dialog.showOpenDialog(win, {
      title: "Seleccionar Juego o Aplicación",
      properties: ["openFile"],
      filters,
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    let targetPath = filePath;

    if (isWindows && filePath.toLowerCase().endsWith(".lnk")) {
      try {
        const link = shell.readShortcutLink(filePath);
        if (link && link.target && fs.existsSync(link.target)) {
          targetPath = link.target;
        }
      } catch (e) {
        console.warn("[dialog:openExecutable] Error leyendo shortcut:", e.message);
      }
    }

    const parsedTarget = path.parse(targetPath);
    let iconDataUrl = null;
    try {
      const iconTarget = fs.existsSync(targetPath) ? targetPath : filePath;
      const nativeImg = await app.getFileIcon(iconTarget, { size: "large" });
      if (nativeImg && !nativeImg.isEmpty()) {
        iconDataUrl = nativeImg.toDataURL();
      }
    } catch (err) {
      console.warn("[dialog:openExecutable] No se pudo extraer icono:", err.message);
    }

    const classification = await autoClassifyProgram(filePath, targetPath);

    return {
      filePath: targetPath,
      fileName: parsedTarget.base,
      title: classification.title,
      type: classification.type,
      icon: classification.cover || iconDataUrl,
    };
  });

  ipcMain.handle("system:extractFileIcon", async (_event, filePath) => {
    if (!filePath || typeof filePath !== "string") return null;
    try {
      const nativeImg = await app.getFileIcon(filePath, { size: "large" });
      if (nativeImg && !nativeImg.isEmpty()) {
        return nativeImg.toDataURL();
      }
      return null;
    } catch (err) {
      console.warn("[system:extractFileIcon] Error extrayendo icono:", err.message);
      return null;
    }
  });
}

module.exports = { registerSystemDiagHandlers };
