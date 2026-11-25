#!/usr/bin/env node
/**
 * Migrates arbitrary pixel font sizes (text-[Npx]) across src/ to Onicord's
 * standardized typography scale defined in tailwind.config.js & tokens/typography.css.
 *
 * Usage:
 *   node scripts/migrate-typography-tokens.cjs            # Dry-run (default)
 *   node scripts/migrate-typography-tokens.cjs --dry-run  # Explicit dry-run
 *   node scripts/migrate-typography-tokens.cjs --apply    # Apply changes to disk
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src");
const APPLY = process.argv.includes("--apply");
const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".css"]);

const SIZE_MAP = {
  "8": "text-2xs",
  "9": "text-2xs",
  "10": "text-2xs",
  "11": "text-micro",
  "12": "text-xs",
  "12.5": "text-xs",
  "13": "text-sm",
  "14": "text-sm",
  "15": "text-base",
  "16": "text-lg",
  "18": "text-lg",
  "20": "text-xl",
  "24": "text-2xl",
  "30": "text-3xl",
};

const PX_TEXT_REGEX = /(?<![\w-])((?:[a-z0-9-]+:)*)text-\[(\d+(?:\.\d+)?)px\]/g;

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
const unmapped = new Map();
let filesModified = 0;
let totalReplaced = 0;

for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, "utf8");
  let fileReplacements = 0;

  const updated = original.replace(PX_TEXT_REGEX, (fullMatch, prefix, pxVal) => {
    const targetToken = SIZE_MAP[pxVal];
    if (!targetToken) {
      const rel = path.relative(path.resolve(__dirname, ".."), file).replace(/\\/g, "/");
      if (!unmapped.has(pxVal)) unmapped.set(pxVal, []);
      unmapped.get(pxVal).push(`${rel}: ${fullMatch}`);
      return fullMatch;
    }

    const replacement = `${prefix}${targetToken}`;
    const key = `${fullMatch} -> ${replacement}`;
    breakdown.set(key, (breakdown.get(key) || 0) + 1);
    fileReplacements += 1;
    totalReplaced += 1;
    return replacement;
  });

  if (fileReplacements > 0 && updated !== original) {
    filesModified += 1;
    if (APPLY) {
      fs.writeFileSync(file, updated, "utf8");
    }
  }
}

console.log(
  `\nOnicord Typography Migration [${APPLY ? "APPLIED" : "DRY RUN"}]: ${totalReplaced} replacements across ${filesModified} files\n`
);

if (breakdown.size > 0) {
  console.log("Breakdown:");
  const sorted = [...breakdown.entries()].sort((a, b) => b[1] - a[1]);
  for (const [mapping, count] of sorted) {
    console.log(`${String(count).padStart(4)}  ${mapping}`);
  }
}

if (unmapped.size > 0) {
  console.log("\nUnmapped values (kept untouched):");
  for (const [pxVal, hits] of unmapped.entries()) {
    console.log(`  ${pxVal}px (${hits.length}x): ${hits.slice(0, 5).join(", ")}`);
  }
  process.exitCode = 1;
}
