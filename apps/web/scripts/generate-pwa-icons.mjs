// Generates the PWA app icons as real PNGs with zero dependencies (pure Node
// zlib + a tiny PNG encoder). Run when the mark or colors change:
//
//   node apps/web/scripts/generate-pwa-icons.mjs
//
// Output: apps/web/public/icons/{icon-192,icon-512,icon-maskable-512}.png
// The generated files are committed so the build needs no image toolchain.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BG = [17, 24, 39, 255];     // slate-900 background (full-bleed, maskable-safe)
const MARK = [245, 158, 11, 255]; // amber-500 dovetail mark

// --- tiny PNG encoder (8-bit RGBA, color type 6) -------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // 10,11,12 = compression, filter, interlace = 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (none)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- the dovetail mark ----------------------------------------------------
function drawIcon(size, { maskable }) {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, [r, g, b, a]) => {
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, BG);

  // A single dovetail tail: a trapezoid wider at the top than the bottom.
  // Keep the mark inside the central ~60% so maskable safe-zone crops are fine.
  const scale = maskable ? 0.52 : 0.62;
  const markH = size * scale;
  const y0 = (size - markH) / 2;
  const y1 = y0 + markH;
  const topW = size * scale * 0.92;
  const botW = size * scale * 0.6;
  const cx = size / 2;

  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    const t = (y - y0) / markH; // 0 at top, 1 at bottom
    const w = topW + (botW - topW) * t;
    const half = w / 2;
    for (let x = Math.floor(cx - half); x < Math.ceil(cx + half); x++) {
      if (x >= 0 && x < size && y >= 0 && y < size) put(x, y, MARK);
    }
  }
  return encodePng(size, size, buf);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, "icon-192.png"), drawIcon(192, { maskable: false }));
writeFileSync(join(outDir, "icon-512.png"), drawIcon(512, { maskable: false }));
writeFileSync(join(outDir, "icon-maskable-512.png"), drawIcon(512, { maskable: true }));

console.log("Wrote icon-192.png, icon-512.png, icon-maskable-512.png to", outDir);
