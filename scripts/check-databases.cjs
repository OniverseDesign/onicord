/**
 * check-databases.cjs
 * Utility to verify SQLite database integrity in Onicord.
 * Usage: cmd /c "set ELECTRON_RUN_AS_NODE=1 && .\node_modules\electron\dist\electron.exe scripts/check-databases.cjs"
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const appData = process.env.APPDATA || "";
const onicordDir = path.join(appData, "onicord");

console.log("[DB Check] Inspecting Onicord SQLite databases in:", onicordDir);

function checkDb(filePath) {
  try {
    const db = new Database(filePath, { timeout: 5000 });
    const row = db.prepare("PRAGMA integrity_check;").get();
    const result = Object.values(row)[0];
    db.close();
    return { ok: result === "ok", result };
  } catch (err) {
    return { ok: false, result: err.message };
  }
}

function findDbs(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findDbs(full));
    } else if (entry.isFile() && entry.name.endsWith(".db")) {
      results.push(full);
    }
  }
  return results;
}

const allDbs = findDbs(path.join(onicordDir, "db")).concat(findDbs(path.join(onicordDir, "servers")));
console.log(`[DB Check] Total databases found: ${allDbs.length}`);
let hasError = false;
for (const dbPath of allDbs) {
  const rel = path.relative(onicordDir, dbPath);
  const status = checkDb(dbPath);
  if (!status.ok) {
    console.error(`[INTEGRITY ERROR]: ${rel} -> ${status.result}`);
    hasError = true;
  } else {
    console.log(`[OK] ${rel}`);
  }
}

if (!hasError && allDbs.length > 0) {
  console.log("\n>>> All databases passed PRAGMA integrity_check successfully! <<<\n");
}
