const { app, utilityProcess } = require("electron");
const http = require("http");
const path = require("path");
const { resolveWorkerPath, buildWorkerEnv } = require("../workers/workerRunner.cjs");

/**
 * Lightweight main-process facade for TorrentService.
 * Forks `torrentProcess.cjs` on demand in an isolated Electron UtilityProcess
 * and proxies `/torrent/...` HTTP stream/meta/stats requests over localhost.
 */
class TorrentServiceFacade {
  constructor() {
    this._proc = null;
    this._port = 0;
    this._readyPromise = null;
    this._tempBaseDir = null;
  }

  _getTempDir() {
    if (this._tempBaseDir) return this._tempBaseDir;
    const base = app && typeof app.getPath === "function" ? app.getPath("temp") : require("os").tmpdir();
    this._tempBaseDir = path.join(base, "onicord-torrents");
    return this._tempBaseDir;
  }

  getStreamPort() {
    const ytdlpService = require("./ytdlpService.cjs");
    return ytdlpService.streamPort || 42883;
  }

  ensureProcess() {
    if (this._proc && this._port > 0) {
      return Promise.resolve(this._port);
    }
    if (this._readyPromise) {
      return this._readyPromise;
    }

    const scriptPath = resolveWorkerPath("torrentProcess.cjs");
    this._readyPromise = new Promise((resolve, reject) => {
      let settled = false;
      const proc = utilityProcess.fork(scriptPath, [], {
        serviceName: "Onicord Torrent Worker",
        stdio: "pipe",
        env: buildWorkerEnv({
          ...process.env,
          ONICORD_TORRENT_TEMP: this._getTempDir(),
        }),
      });

      this._proc = proc;

      const readline = require("readline");
      for (const [stream, logFn] of [
        [proc.stdout, console.log],
        [proc.stderr, console.error],
      ]) {
        if (!stream) continue;
        readline
          .createInterface({ input: stream, crlfDelay: Infinity })
          .on("line", (line) => {
            if (line.trim()) logFn(line);
          });
      }

      const bootTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this._readyPromise = null;
        console.error("[TorrentService] Timeout esperando arranque de torrentProcess");
        try { proc.kill(); } catch (_) {}
        reject(new Error("Timeout starting torrent UtilityProcess"));
      }, 15000);
      if (typeof bootTimer.unref === "function") bootTimer.unref();

      proc.on("error", (type, location) => {
        console.error(`[TorrentService] Error fatal en UtilityProcess: ${type} (${location || "sin ubicacion"})`);
      });

      proc.on("message", (msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "ready" && msg.port) {
          this._port = msg.port;
          if (!settled) {
            settled = true;
            clearTimeout(bootTimer);
            resolve(msg.port);
          }
        } else if (msg.type === "idle-shutdown") {
          if (this._proc === proc) {
            this._proc = null;
            this._port = 0;
            this._readyPromise = null;
          }
        }
      });

      proc.on("exit", (code) => {
        const isCurrent = this._proc === proc;
        if (isCurrent) {
          this._proc = null;
          this._port = 0;
          this._readyPromise = null;
        }
        if (!settled) {
          settled = true;
          clearTimeout(bootTimer);
          console.error(`[TorrentService] torrentProcess salio prematuramente (code=${code})`);
          reject(new Error(`Torrent UtilityProcess exited early (${code})`));
        } else if (isCurrent && code !== 0) {
          console.error(`[TorrentService] torrentProcess termino con codigo ${code}`);
        }
      });
    });

    return this._readyPromise;
  }

  async handleHttpRequest(req, res) {
    let proxyReq = null;
    try {
      const port = await this.ensureProcess();
      const targetUrl = req.url || "/";
      const method = (req.method || "GET").toUpperCase();
      const forwardHeaders = { ...req.headers, host: `127.0.0.1:${port}` };

      proxyReq = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: targetUrl,
          method,
          headers: forwardHeaders,
        },
        (proxyRes) => {
          if (res.destroyed || res.writableEnded) {
            proxyRes.resume();
            return;
          }
          if (!res.headersSent) {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          }
          proxyRes.on("error", (pipeErr) => {
            const isBenignAbort =
              res.destroyed ||
              res.writableEnded ||
              pipeErr?.message === "aborted" ||
              pipeErr?.code === "ECONNRESET";
            if (!isBenignAbort) {
              console.error("[TorrentService] Error leyendo respuesta upstream:", pipeErr.message);
            }
            if (!res.destroyed && !res.writableEnded) {
              res.destroy();
            }
          });
          proxyRes.pipe(res);
        }
      );

      proxyReq.on("error", (err) => {
        if (res.destroyed || res.writableEnded) return;
        if (err?.message !== "aborted" && err?.code !== "ECONNRESET") {
          console.error("[TorrentService] Error en proxy HTTP:", err.message);
        }
        if (!res.headersSent) {
          res.writeHead(502, {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
        }
        if (!res.writableEnded) {
          res.end(`Error en proxy torrent: ${err.message}`);
        }
      });

      res.on("close", () => {
        if (!res.writableEnded) {
          try { proxyReq?.destroy(); } catch (_) {}
        }
      });

      if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        proxyReq.end();
      } else {
        req.pipe(proxyReq);
      }
    } catch (err) {
      console.error("[TorrentService] Error iniciando motor torrent:", err.message);
      if (!res.headersSent) {
        res.writeHead(500, {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
      }
      if (!res.writableEnded) {
        res.end(`Error iniciando motor torrent: ${err.message}`);
      }
    }
  }

  destroyEngine(infoHash) {
    if (!this._proc || !infoHash) return;
    try {
      this._proc.postMessage({ type: "destroy-engine", infoHash });
    } catch (_) {}
  }

  destroyAll() {
    const proc = this._proc;
    this._proc = null;
    this._port = 0;
    this._readyPromise = null;
    if (!proc) return;
    const killTimer = setTimeout(() => {
      try {
        proc.kill();
      } catch (_) {}
    }, 1500);
    if (typeof killTimer.unref === "function") killTimer.unref();
    proc.once("exit", () => clearTimeout(killTimer));
    try {
      proc.postMessage({ type: "shutdown" });
    } catch (_) {
      clearTimeout(killTimer);
      try {
        proc.kill();
      } catch (__) {}
    }
  }
}

module.exports = new TorrentServiceFacade();
