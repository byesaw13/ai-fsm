/**
 * Extract a PO / HD job-tag style label from freeform expense notes.
 * Used by the forgotten-receipts panel so PO tags are searchable.
 */
export function extractReceiptPo(notes: string | null | undefined): string | null {
  if (!notes?.trim()) return null;
  const text = notes.trim();

  // Explicit PO markers: "PO 12345", "PO#ABC-1", "P.O. 99"
  const explicit = text.match(/\bP\.?\s*O\.?\s*[#:]?\s*([A-Za-z0-9][A-Za-z0-9._\-\/]{0,40})/i);
  if (explicit?.[1]) return explicit[1];

  // Home Depot import notes: "Home Depot · SWIFT LANE" or "… · 36 SWIFT → Job Title"
  const hd = text.match(/Home Depot\s*[·•\-–]\s*([^→\n]+?)(?:\s*[→].*)?$/i);
  if (hd?.[1]) {
    const tag = hd[1].trim();
    if (tag && !/^→/.test(tag)) return tag;
  }

  // "Job Name: FOO" / "Job: FOO" / "Project: FOO"
  const jobLabel = text.match(/\b(?:Job(?:\s*Name)?|Project)\s*[:\-]\s*([^\n,;→]+)/i);
  if (jobLabel?.[1]) return jobLabel[1].trim();

  return null;
}

/** Filter forgotten receipts by PO tag, vendor, or freeform notes. */
export function receiptMatchesPoQuery(
  expense: { vendor_name: string; notes: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const po = extractReceiptPo(expense.notes);
  if (po && po.toLowerCase().includes(q)) return true;
  if (expense.vendor_name.toLowerCase().includes(q)) return true;
  if (expense.notes && expense.notes.toLowerCase().includes(q)) return true;
  return false;
}
