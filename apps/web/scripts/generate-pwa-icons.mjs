// Refreshes the PWA app icons from the Dovetails brand kit. Run after the
// brand kit files in apps/web/public/brand change:
//
//   node apps/web/scripts/generate-pwa-icons.mjs
//
// Copies apps/web/public/brand/{icon-192,icon-512,icon-maskable-512}.png into
// apps/web/public/icons/, the paths the web app manifest points at. The brand
// kit is the source of truth for the artwork; this script only places it.

import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const brandDir = join(here, "..", "public", "brand");
const outDir = join(here, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

for (const name of ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
  copyFileSync(join(brandDir, name), join(outDir, name));
  console.log(`wrote public/icons/${name}`);
}
