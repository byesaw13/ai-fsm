// Pure value parsers for the client CSV importer (Square customer export).
// Kept out of the "use client" component so they are unit-testable in node.

/** "$1,310.00" | "836.98" | "0" | "" → integer cents. */
export function spendToCents(raw: string): number {
  const n = parseFloat((raw || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Keep a YYYY-MM-DD date, else "" (Square uses ISO dates; blanks are common). */
export function toDateStr(raw: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test((raw || "").trim()) ? raw.trim() : "";
}

/** Square prefixes phone numbers with a leading apostrophe to preserve the +. */
export function cleanPhone(raw: string): string {
  return (raw || "").replace(/^'/, "").trim();
}
