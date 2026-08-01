/**
 * Shared CSV helpers for store purchase importers (Home Depot, Lowe's, …).
 */

/** Normalize a header for alias matching: lower, strip punctuation. */
export function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/#/g, " number")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find first header index that matches any alias (normalized equality).
 * Aliases should already be normalized or plain words.
 */
export function findCol(header: string[], aliases: string[]): number {
  const norms = header.map(normHeader);
  const want = aliases.map(normHeader);
  // Exact normalized match first (preferred)
  for (const a of want) {
    const i = norms.indexOf(a);
    if (i >= 0) return i;
  }
  // Loose only for multi-word aliases so bare "price" does not steal "extended price"
  for (const a of want) {
    if (!a.includes(" ")) continue;
    const i = norms.findIndex(
      (h) => h.endsWith(` ${a}`) || h.startsWith(`${a} `) || h.includes(` ${a} `),
    );
    if (i >= 0) return i;
  }
  return -1;
}

/** YYYY-MM-DD from ISO, US slash dates, or Date-parseable strings. */
export function parseDateISO(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);

  const us = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s|$)/);
  if (us) {
    let y = parseInt(us[3], 10);
    if (y < 100) y += 2000;
    const mo = us[1].padStart(2, "0");
    const d = us[2].padStart(2, "0");
    if (parseInt(mo, 10) > 12) return null; // not US order
    return `${y}-${mo}-${d}`;
  }

  const ms = Date.parse(t);
  if (!Number.isNaN(ms)) {
    const d = new Date(ms);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    if (y >= 2000 && y <= 2100) return `${y}-${mo}-${day}`;
  }
  return null;
}
