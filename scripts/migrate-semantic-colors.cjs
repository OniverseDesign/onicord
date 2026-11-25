#!/usr/bin/env node
/**
 * Migrates raw Tailwind semantic status colors (amber/rose/emerald 300-600)
 * across src/ to adaptive Onicord tokens (onicord-warning, onicord-danger, onicord-success).
 *
 * Usage:
 *   node scripts/migrate-semantic-colors.cjs            # Dry-run (default)
 *   node scripts/migrate-semantic-colors.cjs --dry-run  # Explicit dry-run
 *   node scripts/migrate-semantic-colors.cjs --apply    # Apply changes to disk
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src");
const APPLY = process.argv.includes("--apply");
const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".css"]);

const SKIP_PATHS = [
  "src/styles/primitives/badges.css",
  "src/styles/base/animations.css",
  "src/components/chat/subcomponents/MessageEmbedCard.jsx",
  "src/components/whiteboard/",
  "src/components/ui/FlameBadge.jsx",
  "src/components/ui/FlamePopover.jsx",
  "src/components/dashboard/widgets/WeatherWidget.jsx",
];

const COLOR_MAP = {
  amber: "onicord-warning",
  rose: "onicord-danger",
  red: "onicord-danger",
  emerald: "onicord-success",
  green: "onicord-success",
  sky: "onicord-info",
  blue: "onicord-info",
  indigo: "onicord-accent",
  purple: "onicord-accent",
  violet: "onicord-accent",
};

const STATUS_TW_REGEX =
  /(?<![\w-])((?:[a-z0-9-]+:)*)(bg|text|border|ring)-(amber|rose|red|emerald|green|sky|blue|indigo|purple|violet)-(?:300|400|500|600)(\/\d+)?(?![\w-])/g;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const breakdown = new Map();
let filesModified = 0;
let totalReplaced = 0;

for (const file of walk(ROOT)) {
  const rel = path.relative(path.resolve(__dirname, ".."), file).replace(/\\/g, "/");
  if (SKIP_PATHS.some((skip) => rel.startsWith(skip) || rel === skip)) continue;

  const original = fs.readFileSync(file, "utf8");
  let fileReplacements = 0;

  const updated = original.replace(
    STATUS_TW_REGEX,
    (fullMatch, prefix, utility, colorName, alpha = "") => {
      const targetColor = COLOR_MAP[colorName];
      const replacement = `${prefix}${utility}-${targetColor}${alpha}`;
      const key = `${fullMatch} -> ${replacement}`;
      breakdown.set(key, (breakdown.get(key) || 0) + 1);
      fileReplacements += 1;
      totalReplaced += 1;
      return replacement;
    }
  );

  if (fileReplacements > 0 && updated !== original) {
    filesModified += 1;
    if (APPLY) {
      fs.writeFileSync(file, updated, "utf8");
    }
  }
}

console.log(
  `\nOnicord Semantic Color Migration [${APPLY ? "APPLIED" : "DRY RUN"}]: ${totalReplaced} replacements across ${filesModified} files\n`
);

if (breakdown.size > 0) {
  console.log("Top mappings:");
  const sorted = [...breakdown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [mapping, count] of sorted) {
    console.log(`${String(count).padStart(4)}  ${mapping}`);
  }
}
