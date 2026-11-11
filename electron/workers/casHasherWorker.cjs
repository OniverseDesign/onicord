const { parentPort } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function ensureDirSync(targetDir) {
  const resolved = path.resolve(targetDir);
  if (fs.existsSync(resolved)) return;
  const missing = [];
  let cur = resolved;
  while (cur && !fs.existsSync(cur)) {
    missing.unshift(cur);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  for (const dir of missing) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir);
      } catch (_) {}
    }
  }
}

if (parentPort) {
  parentPort.on("message", (msg) => {
    if (!msg || !msg.id) return;
    const { id, buffer, ext = "bin", mimeType, casDir } = msg;

    try {
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return parentPort.postMessage({ id, error: "Invalid buffer" });
      }

      const cleanExt = String(ext || "bin")
        .toLowerCase()
        .replace(/^\.+/, "")
        .replace(/[^a-z0-9]/g, "") || "bin";

      // Compute cryptographic hash off the main thread
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const prefix = hash.slice(0, 2);
      const subDir = path.join(casDir, prefix);
      ensureDirSync(subDir);

      const fileName = `${hash}.${cleanExt}`;
      const filePath = path.join(subDir, fileName);

      if (!fs.existsSync(filePath)) {
        const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        try {
          fs.writeFileSync(tmpPath, buffer);
          fs.renameSync(tmpPath, filePath);
        } catch {
          try {
            fs.writeFileSync(filePath, buffer);
          } catch (err) {
            return parentPort.postMessage({ id, error: err.message });
          } finally {
            if (fs.existsSync(tmpPath)) {
              try {
                fs.unlinkSync(tmpPath);
              } catch (_) {}
            }
          }
        }
      }

      parentPort.postMessage({
        id,
        hash,
        ext: cleanExt,
        mimeType: mimeType || "application/octet-stream",
        size: buffer.length,
        filePath,
        uri: `onicord-media://cas/${hash}.${cleanExt}`,
      });
    } catch (err) {
      parentPort.postMessage({ id, error: err.message });
    }
  });
}
