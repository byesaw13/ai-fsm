/**
 * Web helpers for matching expenses / OCR text to jobs via Supply PO.
 * Pure domain logic lives in @ai-fsm/domain job-po.
 */

import {
  extractSupplyPoCandidates,
  matchJobsBySupplyPo,
  toSupplyPo,
  type JobPoMatch,
  type JobPoMatchInput,
} from "@ai-fsm/domain";
import { extractReceiptPo } from "@/lib/invoices/receipt-po";

export type { JobPoMatch };

/** Combine OCR po_number, notes, and vendor into one match haystack. */
export function buildPoMatchText(parts: {
  po_number?: string | null;
  notes?: string | null;
  vendor_name?: string | null;
  job_name?: string | null;
}): string {
  return [parts.po_number, parts.notes, parts.vendor_name, parts.job_name]
    .filter((s): s is string => !!s?.trim())
    .join("\n");
}

/**
 * Prefer exact Supply PO match; return null if none or ambiguous.
 */
export function suggestJobFromPoText(
  text: string | null | undefined,
  jobs: JobPoMatchInput[],
): JobPoMatch | null {
  return matchJobsBySupplyPo(text, jobs);
}

/**
 * Best display PO for an expense row (notes / OCR).
 * Prefers structured supply PO candidates over freeform HD tags.
 */
export function displayPoForExpense(notes: string | null | undefined): string | null {
  const candidates = extractSupplyPoCandidates(notes ?? "");
  if (candidates[0]) return candidates[0];
  return extractReceiptPo(notes);
}

export { toSupplyPo, extractSupplyPoCandidates, matchJobsBySupplyPo };
