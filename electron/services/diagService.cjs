const path = require("path");
const os = require("os");

function safeSerialize(val) {
  if (val === null) return "null";
  if (val === undefined) return "undefined";
  if (val instanceof Error) {
    return `${val.name}: ${val.message}\nStack: ${val.stack}`;
  }
  if (typeof val === "object") {
    try {
      const seen = new WeakSet();
      return JSON.stringify(val, (key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) {
            return "[Circular]";
          }
          seen.add(value);
        }
        if (typeof value === "string" && value.startsWith("data:image/")) {
          return value.substring(0, 30) + "...<base64_data_truncated>";
        }
        return value;
      });
    } catch (e) {
      return `[Serialization Error: ${e.message}]`;
    }
  }
  let str = String(val);
  if (str.startsWith("data:image/")) {
    str = str.substring(0, 30) + "...<base64_data_truncated>";
  }
  return str;
}

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

class DiagService {
  constructor() {
    this.logs = [];
    this.maxLogs = 200;
  }

  log(level, category, message) {
    // Avoid double logging if the message is already prefix-formatted by OniDiag
    if (String(message).startsWith("[OniDiag]")) {
      return;
    }

    const entry = {
      timestamp: Date.now(),
      level: level || "info", // "info" | "warn" | "error"
      category: category || "General",
      message: String(message),
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Print to console standard out in dev modes using original methods
    const prefix = `[OniDiag][${entry.level.toUpperCase()}][${entry.category}]`;
    if (level === "error") {
      originalError(prefix, message);
    } else if (level === "warn") {
      originalWarn(prefix, message);
    } else {
      originalLog(prefix, message);
    }
  }

  getLocalLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    this.log("info", "System", "Diagnostic logs cleared.");
  }

  /**
   * Scrubs private details from logs before sharing with peers or exporting.
   * - Hides 8-digit HEX invite codes (e.g. roomCodes)
   * - Hides absolute user directories
   * - Replaces message text / sticker codes with metadata descriptions
   */
  sanitizeLogs(rawLogs) {
    if (!Array.isArray(rawLogs)) return [];

    const homeDir = os.homedir();
    const escapedHomeDir = homeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const homeRegex = new RegExp(escapedHomeDir, 'gi');

    // Limit to latest 200 entries to prevent giant P2P message bursts
    const boundedLogs = rawLogs.slice(-200);

    return boundedLogs.map((entry) => {
      let msg = String(entry.message || "");

      // 1. Scrub user home directory path (cross-platform)
      msg = msg.replace(homeRegex, "<UserHome>");

      // 2. Scrub Windows absolute directory paths (e.g. C:\Users\name\AppData\Roaming\Onicord...)
      msg = msg.replace(/[A-Za-z]:\\[^:\n\r\t]+/g, (match) => {
        if (match.toLowerCase().includes("onicord")) {
          return `<UserAppData>\\Onicord\\${path.basename(match)}`;
        }
        return `<ScrubbedAbsolutePath>\\${path.basename(match)}`;
      });

      // 3. Scrub POSIX absolute directory paths (e.g. /Users/name/Library/Application Support/Onicord...)
      msg = msg.replace(/(?<!\w)\/[a-zA-Z0-9_\-\.]+([a-zA-Z0-9_\-\.]+\/)+[a-zA-Z0-9_\-\.]+/g, (match) => {
        if (match.toLowerCase().includes("onicord")) {
          return `/UserAppData/Onicord/${path.basename(match)}`;
        }
        return `/ScrubbedAbsolutePath/${path.basename(match)}`;
      });

      // 4. Scrub roomCodes / HEX invite codes (8-char HEX)
      msg = msg.replace(/\b[A-F0-9]{8}\b/g, "<ScrubbedRoomCode>");

      // 5. Scrub private keys or JSON tokens
      msg = msg.replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"<scrubbed>"');
      msg = msg.replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"<scrubbed>"');

      // 6. Scrub inline base64 image strings
      msg = msg.replace(/data:image\/[a-zA-Z]+;base64,[a-zA-Z0-9+/=]+/g, (match) => {
        return match.substring(0, 30) + "...<base64_data_truncated>";
      });

      // 7. Clamp excessively long messages to 2000 chars
      if (msg.length > 2000) {
        msg = msg.substring(0, 2000) + "...<truncated>";
      }

      return {
        ...entry,
        message: msg,
      };
    });
  }
}

// Singleton instance
const diagService = new DiagService();

// Hook standard console log methods
console.log = (...args) => {
  const msg = args.map(safeSerialize).join(" ");
  originalLog(...args);
  diagService.log("info", "Console", msg);
};

console.warn = (...args) => {
  const msg = args.map(safeSerialize).join(" ");
  originalWarn(...args);
  diagService.log("warn", "Console", msg);
};

console.error = (...args) => {
  const msg = args.map(safeSerialize).join(" ");
  originalError(...args);
  diagService.log("error", "Console", msg);
};

// Hook process stdout & stderr streams (captures native C++ Chromium logs & child process outputs)
const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);

process.stdout.write = function (chunk, encoding, callback) {
  if (chunk) {
    const str = typeof chunk === "string" ? chunk : String(chunk);
    const lines = str.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      if (!line.includes("[OniDiag]")) {
        diagService.log("info", "StdOut", line);
      }
    }
  }
  return origStdoutWrite(chunk, encoding, callback);
};

process.stderr.write = function (chunk, encoding, callback) {
  if (chunk) {
    const str = typeof chunk === "string" ? chunk : String(chunk);
    const lines = str.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      if (!line.includes("[OniDiag]")) {
        diagService.log("error", "StdErr", line);
      }
    }
  }
  return origStderrWrite(chunk, encoding, callback);
};

// Hook process exceptions
process.on("uncaughtException", (err) => {
  diagService.log("error", "Crash", `Uncaught Exception: ${err.message}\nStack: ${err.stack}`);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? `${reason.message}\nStack: ${reason.stack}` : String(reason);
  diagService.log("error", "Crash", `Unhandled Rejection: ${msg}`);
});

module.exports = diagService;
