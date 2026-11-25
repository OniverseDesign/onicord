#!/usr/bin/env node
/**
 * Scans src/ for hardcoded dark/light utility classes, color literals,
 * arbitrary pixel typography (text-[*px]), raw status colors, arbitrary z-index,
 * raw durations, and non-flame glow shadows.
 *
 * Usage:
 *   node scripts/audit-theme-classes.cjs               # Ranked summary by file
 *   node scripts/audit-theme-classes.cjs --detail      # Show every line & match
 *   node scripts/audit-theme-classes.cjs --breakdown   # Group by matched token
 *   node scripts/audit-theme-classes.cjs --file=Chat   # Filter by path substring
 *   node scripts/audit-theme-classes.cjs --strict      # Exit 1 if matches > 0
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src");
const args = process.argv.slice(2);
const showDetail = args.includes("--detail");
const showBreakdown = args.includes("--breakdown");
const strictMode = args.includes("--strict");
const fileArg = args.find((a) => a.startsWith("--file="));
const fileFilter = fileArg ? fileArg.slice("--file=".length).toLowerCase() : null;

const INFRA_SKIP_PATHS = [
  "src/styles/tokens/",
  "src/lib/colors.js",
  "src/components/whiteboard/exportWhiteboardPng.js",
];

const FLAME_AND_DECOR_SKIP = [
  "src/styles/primitives/badges.css",
  "src/styles/base/animations.css",
  "src/components/ui/FlameBadge.jsx",
  "src/components/ui/FlamePopover.jsx",
  "src/components/whiteboard/",
  "src/components/chat/subcomponents/MessageEmbedCard.jsx",
];

const PATTERNS = [
  { name: "border-white/*", regex: /\b(?:hover:|focus:|active:)?border-white(?:\/\d+|\/\[[^\]]+\])?\b/g },
  { name: "bg-white/*", regex: /\b(?:hover:|focus:|active:)?bg-white(?:\/\d+|\/\[[^\]]+\])?\b/g },
  { name: "divide/ring-white/*", regex: /\b(?:divide|ring)-white(?:\/\d+|\/\[[^\]]+\])?\b/g },
  { name: "text-white", regex: /\b(?:hover:)?text-white(?:\/\d+)?\b/g },
  { name: "bg/border-black/*", regex: /\b(?:hover:)?(?:bg|border)-black(?:\/\d+|\/\[[^\]]+\])\b/g },
  { name: "rgba(255/0)", regex: /rgba\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\s*,/g },
  { name: "text-[*px]", regex: /(?<![\w-])(?:[a-z0-9-]+:)*text-\[\d+(?:\.\d+)?px\]/g },
  {
    name: "raw-status-tw",
    skipDecorative: true,
    regex: /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|ring)-(?:amber|rose|red|emerald|green|sky|blue|indigo|purple|violet)-(?:300|400|500|600)(?:\/\d+)?(?![\w-])/g,
  },
  { name: "z-[*]", regex: /(?<![\w-])(?:[a-z0-9-]+:)*z-\[[^\]]+\]/g },
  { name: "duration-raw", regex: /(?<![\w-])(?:[a-z0-9-]+:)*duration-(?:100|150|200|300|500)(?![\w-])/g },
  {
    name: "shadow-glow",
    skipDecorative: true,
    regex: /(?<![\w-])shadow-\[0_0_[^\]]+\]/g,
  },
];

const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".css"]);

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

const results = [];
let totalMatches = 0;

for (const file of walk(ROOT)) {
  const rel = path.relative(path.resolve(__dirname, ".."), file).replace(/\\/g, "/");
  if (INFRA_SKIP_PATHS.some((skip) => rel.startsWith(skip) || rel === skip)) continue;
  if (fileFilter && !rel.toLowerCase().includes(fileFilter)) continue;

  const isDecorative = FLAME_AND_DECOR_SKIP.some((skip) => rel.startsWith(skip) || rel === skip);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const fileHits = [];
  const counts = {};

  lines.forEach((line, idx) => {
    for (const { name, regex, skipDecorative } of PATTERNS) {
      if (skipDecorative && isDecorative) continue;
      regex.lastIndex = 0;
      const matches = line.match(regex);
      if (matches && matches.length > 0) {
        counts[name] = (counts[name] || 0) + matches.length;
        totalMatches += matches.length;
        fileHits.push({ line: idx + 1, category: name, matches, text: line.trim() });
      }
    }
  });

  if (fileHits.length > 0) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    results.push({ rel, total, counts, fileHits });
  }
}

results.sort((a, b) => b.total - a.total);

console.log(`\nOnicord Theme Audit: ${totalMatches} hardcoded matches across ${results.length} files\n`);

if (showBreakdown) {
  const tokenCounts = {};
  for (const item of results) {
    for (const hit of item.fileHits) {
      for (const m of hit.matches) {
        tokenCounts[m] = (tokenCounts[m] || 0) + 1;
      }
    }
  }
  const sorted = Object.entries(tokenCounts).sort((a, b) => b[1] - a[1]);
  for (const [token, count] of sorted) {
    console.log(`${String(count).padStart(4)}  ${token}`);
  }
  if (strictMode && totalMatches > 0) process.exit(1);
  process.exit(0);
}

for (const item of results) {
  const breakdown = Object.entries(item.counts)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  console.log(`${String(item.total).padStart(3)}  ${item.rel}  [${breakdown}]`);

  if (showDetail || fileFilter) {
    for (const hit of item.fileHits) {
      console.log(`     L${hit.line} (${hit.category}): ${hit.matches.join(" ")}`);
    }
  }
}

if (strictMode && totalMatches > 0) {
  process.exit(1);
}
