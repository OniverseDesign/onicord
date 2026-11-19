#!/usr/bin/env node
/**
 * Scans src/ for hardcoded dark/light utility classes and color literals
 * that should be migrated to adaptive Onicord theme tokens
 * (border-onicord-border, bg-onicord-tint/*, text-onicord-text, text-onicord-on-accent, etc.).
 *
 * Usage:
 *   node scripts/audit-theme-classes.cjs               # Ranked summary by file
 *   node scripts/audit-theme-classes.cjs --detail      # Show every line & match
 *   node scripts/audit-theme-classes.cjs --file=Chat   # Filter by path substring
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src");
const args = process.argv.slice(2);
const showDetail = args.includes("--detail");
const showBreakdown = args.includes("--breakdown");
const fileArg = args.find((a) => a.startsWith("--file="));
const fileFilter = fileArg ? fileArg.slice("--file=".length).toLowerCase() : null;

const PATTERNS = [
  { name: "border-white/*", regex: /\b(?:hover:|focus:|active:)?border-white(?:\/\d+|\/\[[^\]]+\])?\b/g },
  { name: "bg-white/*", regex: /\b(?:hover:|focus:|active:)?bg-white(?:\/\d+|\/\[[^\]]+\])?\b/g },
  { name: "divide/ring-white/*", regex: /\b(?:divide|ring)-white(?:\/\d+|\/\[[^\]]+\])?\b/g },
  { name: "text-white", regex: /\b(?:hover:)?text-white(?:\/\d+)?\b/g },
  { name: "bg/border-black/*", regex: /\b(?:hover:)?(?:bg|border)-black(?:\/\d+|\/\[[^\]]+\])\b/g },
  { name: "rgba(255/0)", regex: /rgba\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\s*,/g },
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
  if (fileFilter && !rel.toLowerCase().includes(fileFilter)) continue;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const fileHits = [];
  const counts = {};

  lines.forEach((line, idx) => {
    for (const { name, regex } of PATTERNS) {
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
