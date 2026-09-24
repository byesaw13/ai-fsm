import { inflateSync } from "node:zlib";

/**
 * pdf-lib Flate-compresses content streams and encodes drawn text as hex
 * strings (`<48656C6C6F> Tj`). Inflate + decode so tests can assert on labels.
 */
export function pdfDrawnText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const streams: string[] = [];
  const marker = Buffer.from("stream\n");
  const endMarker = Buffer.from("\nendstream");
  let from = 0;
  while (from < raw.length) {
    const start = raw.indexOf(marker, from);
    if (start < 0) break;
    const dataStart = start + marker.length;
    const end = raw.indexOf(endMarker, dataStart);
    if (end < 0) break;
    const chunk = raw.subarray(dataStart, end);
    try {
      streams.push(inflateSync(chunk).toString("latin1"));
    } catch {
      /* not a flate stream (e.g. binary image / xref) */
    }
    from = end + endMarker.length;
  }
  const joined = streams.join("\n");
  const decoded: string[] = [];
  for (const m of joined.matchAll(/<([0-9A-Fa-f]+)>/g)) {
    const hex = m[1];
    if (hex.length % 2 !== 0) continue;
    let s = "";
    for (let i = 0; i < hex.length; i += 2) {
      s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    decoded.push(s);
  }
  return decoded.join("\n");
}
