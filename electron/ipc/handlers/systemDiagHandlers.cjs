const { app, ipcMain, shell, Notification, BrowserWindow } = require("electron");
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

  ipcMain.on("show-os-notification", (event, { title, body }) => {
    try {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: title || "Onicord",
          body: body || "",
          silent: false,
        });
        notif.on("click", () => {
          const mainWindow = global.mainWindow || BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
          }
        });
        notif.show();
      } else {
        console.warn("[OS Notification] Notification.isSupported() devolvió false");
      }
    } catch (err) {
      console.error("[OS Notification Error]", err);
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

  // === OpenGraph Scanner ===
  ipcMain.handle("opengraph:fetch", async (_event, targetUrl) => {
    try {
      if (!targetUrl || typeof targetUrl !== "string") return null;

      const cached = ogCacheMap.get(targetUrl);
      if (
        cached &&
        cached.data &&
        cached.data.mediaType &&
        Date.now() - cached.timestamp < CACHE_TTL_MS
      ) {
        return cached.data;
      }

      const urlObj = new URL(targetUrl);
      if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
        return { success: false, error: "Protocolo no permitido" };
      }

      const hostname = urlObj.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.")
      ) {
        console.warn("⚠️ OpenGraph fetch bloqueado hacia red local:", targetUrl);
        return { success: false, error: "Hosts locales no permitidos" };
      }

      const isTikTok = hostname.includes("tiktok.com");
      const isTwitter = hostname.includes("twitter.com") || hostname.includes("x.com");
      const isInstagram = hostname.includes("instagram.com");
      const isYouTube = hostname.includes("youtube.com") || hostname.includes("youtu.be");

      if (isTikTok) {
        try {
          const ttId = extractTikTokId(targetUrl);
          const oembedResp = await fetch(
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(targetUrl)}`,
          );
          if (oembedResp.ok) {
            const oembedData = await oembedResp.json();
            const embedUrl = ttId ? `https://www.tiktok.com/embed/v2/${ttId}` : null;
            const payloadResult = {
              title: oembedData.title || oembedData.author_name || "TikTok Video",
              description: oembedData.author_name ? `@${oembedData.author_name} on TikTok` : "Watch on TikTok",
              image: oembedData.thumbnail_url,
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
        } catch (e) {
          console.warn("TikTok oEmbed fetch failed, falling back to direct parse");
        }
      }

      let fetchUrl = targetUrl;
      if (isTwitter) {
        fetchUrl = targetUrl
          .replace("://twitter.com", "://fxtwitter.com")
          .replace("://x.com", "://fxtwitter.com");
      }

      let response;
      try {
        response = await fetch(fetchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
          },
          redirect: "follow",
        });
      } catch (fErr) {
        response = await fetch(targetUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          redirect: "follow",
        });
      }

      if (!response || !response.ok) {
        return {
          success: false,
          error: `HTTP error! status: ${response?.status || 'unknown'}`,
        };
      }

      const html = await response.text();

      const getMeta = (prop) => {
        const match =
          html.match(
            new RegExp(`<meta[^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["'][^>]+content=["']([^"']+)["']`, "i")
          ) ||
          html.match(
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["']`, "i")
          );
        return match ? match[1] : null;
      };

      const cleanText = (str) =>
        str
          ? str
              .replace(/&amp;/g, "&")
              .replace(/&#x26;/g, "&")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
          : str;

      const title =
        cleanText(
          getMeta("title") ||
            html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
            urlObj.hostname
        );
      const description = cleanText(
        getMeta("description") || "Haz clic para abrir este enlace completo..."
      );
      let rawImage = getMeta("image") || getMeta("image:src");
      let image = rawImage
        ? rawImage.replace(/&amp;/g, "&").replace(/&#x26;/g, "&")
        : null;

      if (
        image &&
        (isInstagram ||
          image.includes("cdninstagram.com") ||
          image.includes("fbcdn.net"))
      ) {
        try {
          const imgResp = await fetch(image, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
            },
          });
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
      const video =
        getMeta("video") ||
        getMeta("video:secure_url") ||
        getMeta("player:stream");
      const audio = getMeta("audio") || getMeta("audio:secure_url");

      let siteName = getMeta("site_name");
      if (isTwitter || hostname.includes("x.com") || hostname.includes("twitter.com"))
        siteName = "Twitter / X";
      else if (isTikTok) siteName = "TikTok";
      else if (isInstagram) siteName = "Instagram";
      else if (isYouTube) siteName = "YouTube";
      else if (!siteName) siteName = urlObj.hostname;

      let embedUrl = null;
      let mediaType = "website";
      let aspectRatio = "16:9";

      const ytId = extractYouTubeId(targetUrl);
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
      } else if (video || isTikTok || isInstagram) {
        mediaType = "video";
        aspectRatio = isTikTok || (isInstagram && targetUrl.includes("reel")) ? "9:16" : "16:9";
      } else if (audio) {
        mediaType = "audio";
      } else if (image) {
        mediaType = "image";
      }

      if (!ytId && !ttId && !igInfo) {
        const metaW = parseInt(
          getMeta("video:width") || getMeta("image:width"),
          10,
        );
        const metaH = parseInt(
          getMeta("video:height") || getMeta("image:height"),
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
        `🚀 [OG Scanner Send] Metadata ready for "${payloadResult.title}". Type: ${mediaType}, AspectRatio: ${aspectRatio}`,
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

  // === Game Presence ===
  ipcMain.handle("game:get-current", () => {
    const { getCurrentState } = require("../../gameScanner.cjs");
    return getCurrentState();
  });
}

module.exports = { registerSystemDiagHandlers };
