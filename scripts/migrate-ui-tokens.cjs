#!/usr/bin/env node
/**
 * Migrates repeated UI utility classes across src/ to Onicord's standardized
 * motion, blur, border, and interaction surface tokens.
 *
 * Usage:
 *   node scripts/migrate-ui-tokens.cjs            # Dry-run (default)
 *   node scripts/migrate-ui-tokens.cjs --dry-run  # Explicit dry-run
 *   node scripts/migrate-ui-tokens.cjs --apply    # Apply changes to disk
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src");
const APPLY = process.argv.includes("--apply");
const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".css"]);

const SKIP_PATHS = [
  "src/styles/tokens/",
  "src/lib/colors.js",
];

const REPLACEMENTS = [
  { regex: /(?<![\w-])((?:[a-z0-9-]+:)*)duration-100(?![\w-])/g, to: "$1duration-instant" },
  { regex: /(?<![\w-])((?:[a-z0-9-]+:)*)duration-150(?![\w-])/g, to: "$1duration-fast" },
  { regex: /(?<![\w-])((?:[a-z0-9-]+:)*)duration-200(?![\w-])/g, to: "$1duration-normal" },
  { regex: /(?<![\w-])((?:[a-z0-9-]+:)*)duration-300(?![\w-])/g, to: "$1duration-relaxed" },
  { regex: /(?<![\w-])((?:[a-z0-9-]+:)*)duration-500(?![\w-])/g, to: "$1duration-slow" },
  { regex: /(?<![\w-])((?:[a-z0-9-]+:)*)backdrop-blur-\[2px\](?![\w-])/g, to: "$1backdrop-blur-onicord-backdrop" },
  { regex: /(?<![\w-])((?:[a-z0-9-]+:)*)backdrop-blur-md(?![\w-])/g, to: "$1backdrop-blur-onicord-popover" },
  { regex: /(?<![\w-])((?:[a-z0-9-]+:)*)backdrop-blur-2xl(?![\w-])/g, to: "$1backdrop-blur-onicord-island" },
  { regex: /(?<![\w-])((?:[a-z0-9-]+:)*)border-onicord-tint\/\[0\.04\](?![\w-])/g, to: "$1border-onicord-border-subtle" },
  { regex: /(?<![\w-])((?:[a-z0-9-]+:)*)border-onicord-tint\/(?:10|20)(?![\w-/])/g, to: "$1border-onicord-border-strong" },
  { regex: /(?<![\w-])hover:bg-onicord-tint\/(?:5|10)(?![\w-/])/g, to: "hover:bg-onicord-hover" },
  { regex: /(?<![\w-])active:bg-onicord-tint\/10(?![\w-/])/g, to: "active:bg-onicord-active" },
];

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
  if (SKIP_PATHS.some((skip) => rel.startsWith(skip))) continue;

  const original = fs.readFileSync(file, "utf8");
  let updated = original;
  let fileReplacements = 0;

  for (const { regex, to } of REPLACEMENTS) {
    updated = updated.replace(regex, (fullMatch, prefix) => {
      const replacement = to.includes("$1") ? to.replace("$1", prefix || "") : to;
      const key = `${fullMatch} -> ${replacement}`;
      breakdown.set(key, (breakdown.get(key) || 0) + 1);
      fileReplacements += 1;
      totalReplaced += 1;
      return replacement;
    });
  }

  if (fileReplacements > 0 && updated !== original) {
    filesModified += 1;
    if (APPLY) {
      fs.writeFileSync(file, updated, "utf8");
    }
  }
}

console.log(
  `\nOnicord UI Token Migration [${APPLY ? "APPLIED" : "DRY RUN"}]: ${totalReplaced} replacements across ${filesModified} files\n`
);

if (breakdown.size > 0) {
  console.log("Top mappings:");
  const sorted = [...breakdown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  for (const [mapping, count] of sorted) {
    console.log(`${String(count).padStart(4)}  ${mapping}`);
  }
}
