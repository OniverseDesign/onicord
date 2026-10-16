const { app } = require("electron");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const http = require("http");
const https = require("https");
const url = require("url");

const ALLOWED_MEDIA_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "soundcloud.com",
  "www.soundcloud.com",
  "m.soundcloud.com",
]);

function sanitizeAndValidateMediaUrl(rawUrl) {
  if (typeof rawUrl !== "string") {
    throw new Error("URL inválida.");
  }
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("-") || trimmed.startsWith("/")) {
    throw new Error("Parámetro no permitido en URL.");
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Formato de URL no válido.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Solo se permiten URLs seguras HTTPS.");
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_MEDIA_HOSTS.has(host)) {
    throw new Error(`Dominio multimedia no autorizado: ${host}`);
  }

  return parsed.toString();
}

class YtdlpService {
  constructor() {
    const devPath = path.join(__dirname, "..", "bin", "yt-dlp.exe");
    const prodPath = path.join(
      process.resourcesPath || "",
      "app.asar.unpacked",
      "electron",
      "bin",
      "yt-dlp.exe"
    );
    this.ytdlpBinaryPath = fs.existsSync(devPath) ? devPath : prodPath;

    this.streamServer = null;
    this.streamTargetUrls = new Map(); // trackId -> targetStreamUrl
    this.currentTargetStreamUrl = "";
    this.streamPort = 42883;
    this.activeYoutubeProcess = null;
    this.activeBackgroundDownloads = new Set();
    this.preferredCookieBrowser = null;
    this.playlistLoadingCancelled = false;

    global.activeDownloadBytesThisSecond = 0;
  }

  async autoUpdateYtdlp() {
    console.log("[Onicord Core] Verificando actualizaciones de seguridad para yt-dlp...");
    return new Promise((resolve) => {
      if (!fs.existsSync(this.ytdlpBinaryPath)) {
        console.error(`[Onicord Core Error] No se encontró el binario en: ${this.ytdlpBinaryPath}`);
        return resolve();
      }
      execFile(this.ytdlpBinaryPath, ["-U"], (error, stdout, stderr) => {
        if (error) {
          console.log("[Onicord Core] Verificación de yt-dlp completada (proceso activo o versión al día).");
        } else {
          console.log("[Onicord Core] yt-dlp actualizado con éxito:", stdout.trim());
        }
        resolve();
      });
    });
  }

  startLocalStreamServer() {
    if (this.streamServer) return;

    this.streamServer = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);

      if (parsedUrl.pathname === "/proxy-embed-image") {
        const targetImgUrl = parsedUrl.query.url;

        try {
          const targetUrlObj = new URL(targetImgUrl);
          if (targetUrlObj.protocol !== "https:") {
            console.warn("⚠️ Proxy bloqueado: Solo se permite protocolo HTTPS.", targetImgUrl);
            res.writeHead(403);
            return res.end("Forbidden: Only HTTPS allowed");
          }
        } catch (e) {
          res.writeHead(400);
          return res.end("Bad Request: Invalid URL");
        }

        const clientHttp = targetImgUrl.startsWith("https") ? https : http;
        return clientHttp
          .get(targetImgUrl, (streamRes) => {
            streamRes.pipe(res);
          })
          .on("error", () => {
            res.end();
          });
      }

      if (
        parsedUrl.pathname === "/onicord-media-stream" ||
        req.url.includes("onicord-media://stream")
      ) {
        const trackId = parsedUrl.query.v;
        const cacheDir = path.join(app.getPath("userData"), "music_cache");
        let diskFilePath = null;

        if (trackId && fs.existsSync(cacheDir)) {
          const files = fs.readdirSync(cacheDir);
          const match = files.find(
            (f) => f.startsWith(`${trackId}_`) && f.endsWith(".webm")
          );
          if (match) {
            const fullPath = path.join(cacheDir, match);
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > 1000) {
              diskFilePath = fullPath;
            }
          }
        }

        if (diskFilePath) {
          console.log(`\n⚡ [Proxy HTTP] Sirviendo directamente desde caché local en disco para ID: ${trackId}`);
          const stat = fs.statSync(diskFilePath);
          const fileSize = stat.size;
          const range = req.headers.range;

          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = end - start + 1;
            const file = fs.createReadStream(diskFilePath, { start, end });
            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Accept-Ranges": "bytes",
              "Content-Length": chunksize,
              "Content-Type": 'audio/webm; codecs="opus"',
              "Access-Control-Allow-Origin": "*",
            });
            req.on("close", () => file.destroy());
            res.on("close", () => file.destroy());
            file.pipe(res);
          } else {
            const file = fs.createReadStream(diskFilePath);
            res.writeHead(200, {
              "Content-Length": fileSize,
              "Content-Type": 'audio/webm; codecs="opus"',
              "Access-Control-Allow-Origin": "*",
            });
            req.on("close", () => file.destroy());
            res.on("close", () => file.destroy());
            file.pipe(res);
          }
          return;
        }

        const targetStreamUrl =
          (trackId && this.streamTargetUrls.get(trackId)) ||
          this.currentTargetStreamUrl;

        if (!targetStreamUrl) {
          console.error("❌ [Proxy HTTP] Petición entrante pero targetStreamUrl está vacío.");
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("No hay un flujo de audio activo en la sala.");
        }

        console.log(`\n📡 [Proxy HTTP] Sincronizando tubería de audio remota para ID: ${trackId || "Desconocido"}`);

        const pipeStream = (targetUrl) => {
          const reqHeaders = {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "*/*",
          };
          if (req.headers.range) {
            reqHeaders.Range = req.headers.range;
          }

          const request = https.get(
            targetUrl,
            { headers: reqHeaders },
            (streamResponse) => {
              if (
                (streamResponse.statusCode === 302 ||
                  streamResponse.statusCode === 301) &&
                streamResponse.headers.location
              ) {
                return pipeStream(streamResponse.headers.location);
              }

              const resHeaders = {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS, HEAD",
                "Content-Type": streamResponse.headers["content-type"] || 'audio/webm; codecs="opus"',
              };

              if (streamResponse.headers["content-range"]) {
                resHeaders["Content-Range"] = streamResponse.headers["content-range"];
              }
              if (streamResponse.headers["accept-ranges"]) {
                resHeaders["Accept-Ranges"] = streamResponse.headers["accept-ranges"];
              }

              res.writeHead(streamResponse.statusCode || 200, resHeaders);

              const cleanup = () => {
                try {
                  request.destroy();
                  streamResponse.destroy();
                } catch (e) {}
              };

              req.on("close", cleanup);
              res.on("close", cleanup);

              streamResponse.on("error", (streamErr) => {
                console.warn("⚠️ [Proxy HTTP] Sockets de YouTube en espera pausada:", streamErr.message);
              });
              streamResponse.pipe(res);
            }
          );
          request.on("error", (err) => {
            console.error("❌ [Proxy HTTP Error] Conexión TLS interceptada de forma segura:", err.message);
            if (!res.headersSent) res.writeHead(500);
            res.end();
          });
        };

        pipeStream(targetStreamUrl);
      } else {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<div style="background:#1e1e2e;color:#cdd6f4;padding:20px;font-family:sans-serif;">Onicord Core Proxy Activo</div>`
        );
      }
    });

    const tryListen = (port) => {
      try {
        this.streamServer.listen(port, "127.0.0.1", () => {
          const addr = this.streamServer.address();
          if (addr && addr.port) {
            this.streamPort = addr.port;
          }
          console.log(`🟢 [Onicord Proxy Core] Canal multimedia unificado en http://127.0.0.1:${this.streamPort}`);
        });
      } catch (e) {
        console.warn("⚠️ Error iniciando puerto del servidor de stream:", e.message);
      }
    };

    this.streamServer.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`[Onicord Proxy Core] Puerto ${this.streamPort} ocupado por otra instancia. Asignando puerto dinámico...`);
        tryListen(0);
      } else {
        console.error("❌ [Onicord Proxy Core Error]", err.message);
      }
    });

    tryListen(this.streamPort);
  }

  abortAllMusicDownloads() {
    this.playlistLoadingCancelled = true;
    this.currentExtractingUrl = null;
    console.log("🛑 Cancelando todas las descargas...");

    if (this.activeYoutubeProcess) {
      try {
        this.activeYoutubeProcess.kill("SIGKILL");
      } catch { }
      this.activeYoutubeProcess = null;
    }

    for (const proc of this.activeBackgroundDownloads) {
      try {
        proc.kill("SIGKILL");
      } catch { }
    }
    this.activeBackgroundDownloads.clear();
  }

  async extractTrack(videoUrl, options = {}) {
    return new Promise((resolve) => {
      let isPromiseResolved = false;

      const safeResolve = (response) => {
        if (isPromiseResolved) return;
        isPromiseResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        return resolve(response);
      };

      const timeoutId = setTimeout(() => {
        console.warn("⏳ [IPC Timeout] La extracción multimedia tardó demasiado o se canceló en Node sin responder.");
        safeResolve({
          success: false,
          error: "Timeout o proceso abortado en el backend.",
        });
      }, 45000);

      try {
        const cleanUrl = sanitizeAndValidateMediaUrl(videoUrl);
        console.log(`\n📥 [Orcesthrator] Evaluando URL validada: ${cleanUrl} (Silent: ${Boolean(options?.silent)})`);
        const isPlaylist =
          cleanUrl.includes("/sets/") ||
          cleanUrl.includes("playlist") ||
          cleanUrl.includes("&list=") ||
          cleanUrl.includes("?list=");

        if (isPlaylist) {
          return this.procesarListaDeReproduccion(cleanUrl, safeResolve, options);
        }

        this.playlistLoadingCancelled = false;
        return this.iniciarExtraccionTradicional(cleanUrl, false, safeResolve, options);
      } catch (err) {
        console.warn("❌ [URL Validation Error]", err.message);
        return safeResolve({ success: false, error: String(err.message) });
      }
    });
  }

  procesarListaDeReproduccion(targetUrl, safeResolve, options = {}) {
    this.playlistLoadingCancelled = false;
    console.log("📋 [Playlist Module] Iniciando escáner de URLs planas...");

    const flatArgs = [
      "--flat-playlist",
      "--playlist-end",
      "100",
      "--dump-json",
      "--no-warnings",
      "--no-check-certificate",
      "--",
      targetUrl,
    ];

    execFile(
      this.ytdlpBinaryPath,
      flatArgs,
      { timeout: 15000 },
      async (flatErr, flatStdout) => {
        if (flatErr || !flatStdout) {
          console.warn("⚠️ [Playlist Module] Falló desglose plano. Derivando a track único...");
          return this.iniciarExtraccionTradicional(targetUrl, false, safeResolve, options);
        }

        try {
          let cancionesDetectadas = [];
          const crudoLimpio = flatStdout.trim();

          if (crudoLimpio.startsWith("{") && !crudoLimpio.includes("\n")) {
            const playlistObjeto = JSON.parse(crudoLimpio);
            if (playlistObjeto.entries && Array.isArray(playlistObjeto.entries)) {
              cancionesDetectadas = playlistObjeto.entries;
            }
          } else {
            const lineas = crudoLimpio.split("\n");
            cancionesDetectadas = lineas.map((l) => JSON.parse(l));
          }

          if (cancionesDetectadas.length === 0) {
            return this.iniciarExtraccionTradicional(targetUrl, false, safeResolve, options);
          }

          console.log(`🎉 [Playlist Module] ¡Éxito! Se detectaron ${cancionesDetectadas.length} tracks.`);

          const primerTrack = cancionesDetectadas[0];
          const primerTrackUrl =
            primerTrack.url ||
            primerTrack.webpage_url ||
            `https://soundcloud.com/${primerTrack.id}`;

          const restoDePistas =
            cancionesDetectadas.length > 1 ? cancionesDetectadas.slice(1) : [];

          console.log(`🔥 [Playlist Module] Lanzando prioridad Alfa inmediata: ${primerTrackUrl}`);

          this.parseAndDownloadPlaylistAlfa(
            primerTrackUrl,
            restoDePistas,
            safeResolve,
            options
          );
        } catch (e) {
          console.error("💥 [Playlist Module Error] Falló el árbol de parsing:", e.message);
          return this.iniciarExtraccionTradicional(targetUrl, false, safeResolve, options);
        }
      }
    );
  }

  parseAndDownloadPlaylistAlfa(primerTrackUrl, restoDePistas, safeResolve, options = {}) {
    if (!options?.silent) {
      this.abortAllMusicDownloads();
    }
    this.playlistLoadingCancelled = false;

    const metaArgs = [
      "--dump-json",
      "--simulate",
      "--no-warnings",
      "--no-check-certificate",
      "--user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "--",
      primerTrackUrl,
    ];

    execFile(
      this.ytdlpBinaryPath,
      metaArgs,
      { timeout: 7000 },
      (metaError, metaStdout) => {
        this.parseAndDownload(
          metaStdout || null,
          primerTrackUrl,
          true,
          null,
          safeResolve,
          restoDePistas,
          options
        );
      }
    );
  }

  iniciarExtraccionTradicional(urlDeTurno, esCancionDeCola, safeResolve, options = {}) {
    if (!esCancionDeCola && !options?.silent) {
      if (this.currentExtractingUrl !== urlDeTurno) {
        this.abortAllMusicDownloads();
        this.currentExtractingUrl = urlDeTurno;
      }
      this.playlistLoadingCancelled = false;
    }

    if (esCancionDeCola && this.playlistLoadingCancelled) {
      return;
    }

    const metaArgs = [
      "--dump-json",
      "--simulate",
      "--no-warnings",
      "--no-check-certificate",
      "--user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36",
    ];

    if (urlDeTurno.includes("youtube.com") || urlDeTurno.includes("youtu.be")) {
      metaArgs.push("--extractor-args", "youtube:player_client=android");
    }

    metaArgs.push("--", urlDeTurno);

    execFile(
      this.ytdlpBinaryPath,
      metaArgs,
      { timeout: 7000 },
      (metaError, metaStdout) => {
        if (metaError) {
          if (urlDeTurno.includes("youtube.com") || urlDeTurno.includes("youtu.be")) {
            console.log("🔐 [Extractor Module] Bot detectado. Activando puente elástico de cookies...");
            return this.tryMetadataWithCookies(urlDeTurno, esCancionDeCola, safeResolve, options);
          } else {
            return this.parseAndDownload(
              metaStdout || null,
              urlDeTurno,
              !esCancionDeCola,
              null,
              safeResolve,
              [],
              options
            );
          }
        } else if (metaStdout) {
          return this.parseAndDownload(
            metaStdout,
            urlDeTurno,
            !esCancionDeCola,
            null,
            safeResolve,
            [],
            options
          );
        } else {
          return this.parseAndDownload(
            null,
            urlDeTurno,
            !esCancionDeCola,
            null,
            safeResolve,
            [],
            options
          );
        }
      }
    );
  }

  tryMetadataWithCookies(urlDeTurno, esCancionDeCola, safeResolve, options = {}) {
    const browsers = ["chrome", "edge", "brave", "firefox", "opera", "vivaldi"];
    console.log(`🔐 [Extractor Module] Inicializando barrido elástico de navegadores locales...`);

    const tryNextBrowser = (index) => {
      if (index >= browsers.length) {
        console.error("❌ [Extractor Module] Ningún navegador local pudo evadir el bloqueo.");
        return safeResolve({
          success: false,
          error: "YouTube bloqueó la petición de forma absoluta.",
        });
      }

      const browser = browsers[index];
      console.log(`🛰️ [Extractor Module] Probando puente elástico con: ${browser}...`);

      const retryArgs = [
        "--dump-json",
        "--simulate",
        "--no-warnings",
        "--no-check-certificate",
        "--cookies-from-browser",
        browser,
        "--extractor-args",
        "youtube:player_client=android",
        "--",
        urlDeTurno,
      ];

      execFile(this.ytdlpBinaryPath, retryArgs, { timeout: 4000 }, (err, stdout) => {
        if (!err && stdout) {
          console.log(`🎉 [Extractor Module] ¡Éxito absoluto! Puente tendido usando cookies de: ${browser}`);
          this.preferredCookieBrowser = browser;
          return this.parseAndDownload(
            stdout,
            urlDeTurno,
            !esCancionDeCola,
            browser,
            safeResolve,
            [],
            options
          );
        }
        tryNextBrowser(index + 1);
      });
    };

    tryNextBrowser(0);
  }

  parseAndDownload(jsonText, urlFisica, esPrincipal, cookieBrowser, safeResolve, restoDePistas = [], options = {}) {
    let title = "Room Audio";
    let author = "Stream Audio";
    let durationFormatted = "0:00";
    let totalSeconds = 0;
    let thumbnail = "";
    let source = "Audio";
    let trackId = String(Date.now());

    const RepublicaYoutube = urlFisica.includes("youtube.com") || urlFisica.includes("youtu.be");

    let directStreamUrl = null;
    if (jsonText) {
      try {
        const output = JSON.parse(jsonText);
        trackId = output.id || Date.now().toString();
        source = output.extractor_key || output.extractor || "Audio";
        thumbnail = output.thumbnail || output.thumbnails?.[0]?.url || "";
        if (!thumbnail && RepublicaYoutube) {
          thumbnail = `https://img.youtube.com/vi/${trackId}/mqdefault.jpg`;
        }

        const isHls = (u) => {
          if (!u || typeof u !== "string") return false;
          const lower = u.toLowerCase();
          return (
            lower.includes(".m3u8") ||
            lower.includes("/hls/") ||
            lower.includes("protocol=m3u8") ||
            lower.includes("format=hls") ||
            lower.includes("manifest/hls") ||
            lower.includes("protocol_type=hls")
          );
        };

        if (output.url && !isHls(output.url)) {
          directStreamUrl = output.url;
        } else if (Array.isArray(output.formats)) {
          const bestAudioFormat =
            output.formats.find((f) => f.acodec !== "none" && f.vcodec === "none" && f.url && !isHls(f.url)) ||
            output.formats.find((f) => f.acodec !== "none" && f.url && !isHls(f.url));
          if (bestAudioFormat && bestAudioFormat.url) {
            directStreamUrl = bestAudioFormat.url;
          }
        }

        title = (output.title || "Room Audio")
          .replace(/\s*[\(\[][^()\[\]]*official[^()\[\]]*[\)\]]/gi, "")
          .replace(/\s*[\(\[][^()\[\]]*video[^()\[\]]*[\)\]]/gi, "");
        author =
          output.artist ||
          output.uploader ||
          output.creator ||
          output.channel ||
          output.uploader_id ||
          "Unknown Artist";
        totalSeconds = parseInt(output.duration, 10) || 0;

        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        durationFormatted = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
      } catch (pErr) { }
    }

    if (!esPrincipal && this.playlistLoadingCancelled) {
      console.log(`[Core Downloader] Bloqueando spawn pasivo pos-aborto para: "${title}"`);
      return;
    }

    const cacheDir = path.join(app.getPath("userData"), "music_cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const trackFileName = `${trackId}_${Date.now()}.webm`;
    const localTrackPath = path.join(cacheDir, trackFileName);

    const formatoDeAudio = RepublicaYoutube
      ? "bestaudio[vcodec=none][acodec=opus]/bestaudio/best"
      : "bestaudio/best";

    const downloadArgs = [
      "--no-warnings",
      "--no-check-certificate",
      "--format",
      formatoDeAudio,
      "-o",
      localTrackPath,
      "--user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ];

    if (cookieBrowser) downloadArgs.push("--cookies-from-browser", cookieBrowser);
    if (RepublicaYoutube) downloadArgs.push("--extractor-args", "youtube:player_client=android");
    downloadArgs.push("--", urlFisica);

    console.log(`\n[Core Downloader] Abriendo cañería para [${source}]: "${title}" (Es Principal: ${esPrincipal})`);

    const procesoDeDescarga = spawn(this.ytdlpBinaryPath, downloadArgs);

    if (esPrincipal) {
      this.activeYoutubeProcess = procesoDeDescarga;
    } else {
      this.activeBackgroundDownloads.add(procesoDeDescarga);
    }

    let hasTriggeredReact = false;

    const triggerPlayback = (streamUrlOverride = null) => {
      if (hasTriggeredReact) return;

      let audioUrl = streamUrlOverride;
      if (!audioUrl) {
        const formattedPath = localTrackPath.replace(/\\/g, "/");
        audioUrl = `onicord-media://win-disk/${formattedPath}?t=${Date.now()}`;
      }

      const isFileAvailable = fs.existsSync(localTrackPath) && fs.statSync(localTrackPath).size > 200;
      if (!streamUrlOverride && !isFileAvailable) {
        return;
      }

      hasTriggeredReact = true;
      console.log(`[Core Downloader] ¡Bytes listos para "${title}"! Sincronizando (Stream Instantáneo: ${Boolean(streamUrlOverride)})...`);

      const trackData = {
        title: String(title),
        author: String(author),
        duration: String(durationFormatted),
        durationSeconds: Number(totalSeconds),
        thumbnail:
          thumbnail ||
          "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=120&auto=format&fit=crop&q=60",
        audioUrl,
        trackId,
        fileName: trackFileName,
        localPath: localTrackPath,
        source: String(source),
        originalUrl: urlFisica,
      };

      if (!options?.silent && global.mainWindow && !global.mainWindow.webContents.isDestroyed()) {
        global.mainWindow.webContents.send("music:queue-bridge", trackData);
      }

      if (esPrincipal) {
        safeResolve({ success: true, track: trackData });

        if (restoDePistas && restoDePistas.length > 0) {
          console.log(`[Pre-cargador] Descargas background para ${restoDePistas.length} tracks...`);

          (async () => {
            for (let i = 0; i < restoDePistas.length; i++) {
              if (this.playlistLoadingCancelled) {
                console.log("[Pre-cargador] Bucle interrumpido por Kill Switch.");
                break;
              }

              const trackInfo = restoDePistas[i];
              const subTrackId = trackInfo.id || trackInfo.id_str || String(Date.now() + i);

              let subTrackUrl = trackInfo.url || trackInfo.webpage_url || trackInfo.url_str;
              if (!subTrackUrl || subTrackUrl.startsWith("/")) {
                subTrackUrl = `https://soundcloud.com/${trackInfo.user?.permalink || "stream"}/${trackInfo.permalink || subTrackId}`;
              }

              await new Promise((r) => setTimeout(r, 2000));

              if (this.playlistLoadingCancelled) {
                console.log("[Pre-cargador] Cancelando precarga por detención.");
                break;
              }

              console.log(`[Pre-cargador] Descargando track de cola [${i + 2}/${restoDePistas.length + 1}]: ${subTrackUrl}`);
              this.iniciarExtraccionTradicional(subTrackUrl, true, () => { }, options);
            }
          })();
        }
      }
    };

    if (directStreamUrl) {
      this.currentTargetStreamUrl = directStreamUrl;
      this.streamTargetUrls.set(trackId, directStreamUrl);
      this.startLocalStreamServer();
      const streamProxyUrl = `http://127.0.0.1:${this.streamPort}/onicord-media-stream?v=${trackId}&t=${Date.now()}`;
      triggerPlayback(streamProxyUrl);
    }

    procesoDeDescarga.stdout.on("data", (chunk) => {
      if (chunk && chunk.length) {
        global.activeDownloadBytesThisSecond += chunk.length;
      }
      triggerPlayback();
    });

    procesoDeDescarga.stderr.on("data", (chunk) => {
      if (chunk && chunk.length) {
        global.activeDownloadBytesThisSecond += chunk.length;
      }
      triggerPlayback();
    });

    procesoDeDescarga.on("error", (err) => {
      if (esPrincipal) return safeResolve({ success: false, error: err.message });
    });

    procesoDeDescarga.on("close", (code) => {
      this.activeBackgroundDownloads.delete(procesoDeDescarga);
      console.log(`Proceso finalizado. Código: ${code}`);
      if (!hasTriggeredReact) {
        triggerPlayback();
      }
      if (esPrincipal) {
        this.activeYoutubeProcess = null;
      }
      if (code !== 0) {
        console.error(`El proceso falló con código: ${code}`);
        return safeResolve({
          success: false,
          error: "El binario de descarga falló o fue cancelado.",
        });
      }
    });
  }

  async localizeTrack(track) {
    if (!track || !track.trackId) {
      return { success: false, error: "Invalid track data" };
    }

    const cacheDir = path.join(app.getPath("userData"), "music_cache");
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      const match = files.find((f) => f.startsWith(`${track.trackId}_`));
      if (match) {
        const absolutePath = path.join(cacheDir, match);
        if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).size > 1000) {
          const formattedPath = absolutePath.replace(/\\/g, "/");
          const proxyUrl = `onicord-media://win-disk/${formattedPath}`;
          console.log(`[Localizer] Found cached music file locally: ${match}`);
          return { success: true, audioUrl: proxyUrl };
        }
      }
    }

    if (this.streamTargetUrls.has(track.trackId)) {
      const streamProxyUrl = `http://127.0.0.1:${this.streamPort}/onicord-media-stream?v=${track.trackId}`;
      return { success: true, audioUrl: streamProxyUrl };
    }

    console.log(`[Localizer] Music file not found locally for track: ${track.title}. Downloading/resolving...`);
    const res = await this.extractTrack(track.originalUrl, { silent: true });
    if (res.success && res.track) {
      return { success: true, audioUrl: res.track.audioUrl };
    } else {
      return { success: false, error: res.error || "Failed to download track" };
    }
  }

  async resolveAndPrepareStream(videoUrl) {
    if (!videoUrl) return { success: false, error: "No URL provided" };
    console.log(`📡 [YtdlpService] Sincronizando flujo de audio para oyente remoto: ${videoUrl}`);
    return this.extractTrack(videoUrl, { silent: true });
  }
}

module.exports = new YtdlpService();
