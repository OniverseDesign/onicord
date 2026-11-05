const { execSync } = require("child_process");
const path = require("path");

const pkg = require("../package.json");
const electronVer = (pkg.devDependencies && pkg.devDependencies.electron) || "33.4.11";
const betterSqliteDir = path.join(__dirname, "..", "node_modules", "better-sqlite3");

try {
  console.log(`[postinstall] Fetching prebuilt better-sqlite3 for Electron ${electronVer}...`);
  execSync(`npx prebuild-install -r electron -t ${electronVer}`, {
    cwd: betterSqliteDir,
    stdio: "inherit",
  });
  console.log(`[postinstall] better-sqlite3 prebuilt ready for Electron!`);
} catch (err) {
  console.warn(`[postinstall] Warning fetching better-sqlite3 prebuild: ${err.message}`);
}
