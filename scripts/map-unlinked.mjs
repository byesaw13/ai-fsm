#!/usr/bin/env node
/**
 * List TypeScript files that nothing else imports and that are not a Next.js
 * entry (page, route, layout). Writes apps/web/app/app/map/unlinked.json.
 * This script does not delete anything.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const roots = ["apps/web", "services/worker", "packages/domain"].map((dir) => path.join(root, dir));
const out = path.join(root, "apps/web/app/app/map/unlinked.json");

const ENTRY = /(?:^|\/)(page|route|layout|loading|error|template|default|not-found|global-error|middleware|instrumentation|manifest)\.(ts|tsx)$|services\/worker\/src\/index\.ts$|(^|\/)vitest(?:\.integration)?\.config\.ts$/;
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "coverage"]);

function walk(dir, acc) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) acc.push(full);
  }
}

const files = [];
for (const dir of roots) walk(dir, files);

function candidates(spec, fromFile) {
  const base = spec.startsWith("@/")
    ? path.join(root, "apps/web", spec.slice(2))
    : path.resolve(path.dirname(fromFile), spec);
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
}

const imported = new Set();
const importRe = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(importRe)) {
    const spec = match[1].replace(/\.(js|jsx)$/, "");
    if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
    for (const candidate of candidates(spec, file)) {
      if (files.includes(candidate)) imported.add(candidate);
    }
  }
}

const unlinked = files
  .filter((file) => !ENTRY.test(file) && !imported.has(file) && !/\.(unit|integration)\.test\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
  .map((file) => path.relative(root, file).split(path.sep).join("/"))
  .sort();

const byFolder = new Map();
for (const file of unlinked) {
  const folder = file.split("/").slice(0, -1).join("/");
  if (!byFolder.has(folder)) byFolder.set(folder, []);
  byFolder.get(folder).push(file.split("/").pop());
}

const groups = [...byFolder.entries()]
  .map(([folder, names]) => ({ folder, files: names }))
  .sort((a, b) => b.files.length - a.files.length || a.folder.localeCompare(b.folder));

fs.writeFileSync(out, JSON.stringify({ generatedFrom: "scripts/map-unlinked.mjs", count: unlinked.length, groups }, null, 2) + "\n");
console.log(`unlinked ${unlinked.length} files in ${groups.length} folders`);
