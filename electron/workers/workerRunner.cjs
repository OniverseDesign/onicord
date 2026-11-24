const path = require("path");
const fs = require("fs");
const { Worker } = require("worker_threads");

/**
 * Resolves a worker script path for both dev mode and packaged Electron builds (`app.asar.unpacked`).
 */
function resolveWorkerPath(workerFileName) {
  const localPath = path.join(__dirname, workerFileName);
  if (localPath.includes("app.asar") && !localPath.includes("app.asar.unpacked")) {
    const unpackedPath = localPath.replace("app.asar", "app.asar.unpacked");
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }
  }
  return localPath;
}

/**
 * Builds an environment object with `NODE_PATH` populated for packaged ASAR/unpacked worker threads
 * and utility processes so external dependencies inside `app.asar` or `app.asar.unpacked` resolve reliably.
 */
function buildWorkerEnv(baseEnv = process.env) {
  const candidatePaths = [];
  const addCandidate = (p) => {
    if (p && !candidatePaths.includes(p)) {
      candidatePaths.push(p);
    }
  };

  if (__dirname.includes("app.asar.unpacked")) {
    const base = __dirname.slice(0, __dirname.indexOf("app.asar.unpacked"));
    addCandidate(path.join(base, "app.asar.unpacked", "node_modules"));
    addCandidate(path.join(base, "app.asar", "node_modules"));
  } else if (__dirname.includes("app.asar")) {
    const base = __dirname.slice(0, __dirname.indexOf("app.asar"));
    addCandidate(path.join(base, "app.asar", "node_modules"));
    addCandidate(path.join(base, "app.asar.unpacked", "node_modules"));
  }

  if (process.resourcesPath) {
    addCandidate(path.join(process.resourcesPath, "app.asar.unpacked", "node_modules"));
    addCandidate(path.join(process.resourcesPath, "app.asar", "node_modules"));
  }

  if (candidatePaths.length === 0) {
    return baseEnv;
  }

  const existing = baseEnv?.NODE_PATH
    ? String(baseEnv.NODE_PATH).split(path.delimiter).filter(Boolean)
    : [];
  const merged = [];
  for (const p of [...candidatePaths, ...existing]) {
    if (p && !merged.includes(p)) {
      merged.push(p);
    }
  }

  return {
    ...baseEnv,
    NODE_PATH: merged.join(path.delimiter),
  };
}

/**
 * Spawns a one-shot Worker thread, executes a single task, and terminates it immediately in `finally`.
 * Supports optional progress messages (`{ id, progress: { step, percent } }`).
 */
function runOneShotWorker(workerFileName, payload, { timeoutMs = 180_000, onProgress = null } = {}) {
  const workerPath = resolveWorkerPath(workerFileName);
  if (!fs.existsSync(workerPath)) {
    return Promise.reject(new Error(`Worker script not found: ${workerPath}`));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { env: buildWorkerEnv() });
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      worker.terminate().catch(() => {});
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Worker ${workerFileName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      if (typeof timer.unref === "function") timer.unref();
    }

    worker.on("message", (msg) => {
      if (!msg) return;
      if (msg.type === "progress") {
        if (typeof onProgress === "function") {
          try {
            onProgress(msg.step, msg.percent);
          } catch {}
        }
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve(msg.result);
      }
    });

    worker.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });

    worker.on("exit", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code !== 0) {
        reject(new Error(`Worker ${workerFileName} exited with code ${code}`));
      } else {
        resolve(undefined);
      }
    });

    worker.postMessage({ id: 1, ...payload });
  });
}

/**
 * Keeps a single reusable Worker alive while tasks arrive and terminates it automatically
 * after `idleTimeoutMs` of inactivity to reclaim RAM.
 */
class IdleWorkerPool {
  constructor(workerFileName, { idleTimeoutMs = 60_000, defaultTimeoutMs = 30_000 } = {}) {
    this.workerFileName = workerFileName;
    this.idleTimeoutMs = idleTimeoutMs;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this._worker = null;
    this._reqId = 1;
    this._pending = new Map();
    this._idleTimer = null;
  }

  _clearIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  _scheduleIdleShutdown() {
    this._clearIdleTimer();
    if (this._pending.size > 0 || !this._worker) return;
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      if (this._pending.size === 0 && this._worker) {
        const w = this._worker;
        this._worker = null;
        w.terminate().catch(() => {});
      }
    }, this.idleTimeoutMs);
    if (typeof this._idleTimer.unref === "function") this._idleTimer.unref();
  }

  _ensureWorker() {
    if (this._worker) return this._worker;
    const workerPath = resolveWorkerPath(this.workerFileName);
    if (!fs.existsSync(workerPath)) return null;

    const worker = new Worker(workerPath, { env: buildWorkerEnv() });
    if (typeof worker.unref === "function") worker.unref();

    worker.on("message", (msg) => {
      if (!msg || !msg.id) return;
      const entry = this._pending.get(msg.id);
      if (!entry) return;
      this._pending.delete(msg.id);
      if (entry.timer) clearTimeout(entry.timer);
      if (msg.error) {
        entry.reject(new Error(msg.error));
      } else {
        entry.resolve(msg.result);
      }
      if (this._pending.size === 0) {
        this._scheduleIdleShutdown();
      }
    });

    const failAll = (err) => {
      if (this._worker === worker) {
        this._worker = null;
      }
      this._clearIdleTimer();
      for (const [, entry] of this._pending) {
        if (entry.timer) clearTimeout(entry.timer);
        entry.reject(err);
      }
      this._pending.clear();
    };

    worker.on("error", failAll);
    worker.on("exit", (code) => {
      if (this._worker === worker) {
        this._worker = null;
      }
      if (this._pending.size > 0) {
        failAll(new Error(`Worker ${this.workerFileName} exited (${code})`));
      }
    });

    this._worker = worker;
    return worker;
  }

  run(payload, timeoutMs = this.defaultTimeoutMs) {
    this._clearIdleTimer();
    const worker = this._ensureWorker();
    if (!worker) {
      return Promise.reject(new Error(`Unable to start worker ${this.workerFileName}`));
    }

    const id = this._reqId++;
    return new Promise((resolve, reject) => {
      let timer = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this._pending.delete(id);
          reject(new Error(`Worker ${this.workerFileName} request ${id} timed out`));
          if (this._pending.size === 0) this._scheduleIdleShutdown();
        }, timeoutMs);
        if (typeof timer.unref === "function") timer.unref();
      }
      this._pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, ...payload });
    });
  }

  destroy() {
    this._clearIdleTimer();
    if (this._worker) {
      const w = this._worker;
      this._worker = null;
      w.terminate().catch(() => {});
    }
    for (const [, entry] of this._pending) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(new Error("Worker pool destroyed"));
    }
    this._pending.clear();
  }
}

module.exports = {
  resolveWorkerPath,
  buildWorkerEnv,
  runOneShotWorker,
  IdleWorkerPool,
};
