/** TASK-162 Job Reports — pure rules shared by the publish API and pages. */

export const REPORT_AREAS = {
  interior_paint: "Interior paint",
  exterior: "Exterior",
  deck_porch: "Deck / porch",
  carpentry: "Carpentry",
  plumbing: "Plumbing",
  electrical: "Electrical",
  roof_gutters: "Roof / gutters",
  yard: "Yard",
  other: "Other",
} as const;
export type ReportArea = keyof typeof REPORT_AREAS;

export const REPORT_WORK_TYPES = {
  improvement: "Improvement",
  repair: "Repair",
  maintenance: "Maintenance",
} as const;
export type ReportWorkType = keyof typeof REPORT_WORK_TYPES;

export interface ReportRecord {
  label: string;
  detail: string;
}

export interface JobInvoiceFacts {
  client_id: string;
  status: string;
  billing_context: string;
}

export type Recipient =
  | { ok: true; clientId: string; sponsored: boolean }
  | { ok: false; reason: string };

/**
 * Who a job report goes to: the payer on the job's billed invoices. Drafts and
 * voids don't count. No billed invoice, or two different payers, blocks
 * publishing so a report never lands with the wrong person.
 */
export function resolveRecipient(invoices: JobInvoiceFacts[]): Recipient {
  const billed = invoices.filter((i) => i.status !== "draft" && i.status !== "void");
  if (billed.length === 0) {
    return { ok: false, reason: "Send the invoice first — the report goes to whoever pays it." };
  }
  const payers = new Set(billed.map((i) => i.client_id));
  if (payers.size > 1) {
    return { ok: false, reason: "This job's invoices go to different people. Fix the invoices so one person pays." };
  }
  return {
    ok: true,
    clientId: billed[0].client_id,
    sponsored: billed.some((i) => i.billing_context === "realtor_sponsored"),
  };
}

// Line names that say nothing to a customer ("Labor", "Travel (T&M) — 2.0 hr").
const GENERIC_LINE = /^(labor|labour|travel|mileage|trip|handling|dump|disposal|assembly labor)\b/i;

/**
 * Pre-filled "what we did": invoice work summary → specific labor lines →
 * job title (unless it's an intake auto-title "Category - Client Name") → blank.
 * Visit tech notes are never used — most are internal filler
 * ("Auto-created from confirmed on-site stop").
 */
export function prefillSummary(input: {
  workSummaries: (string | null)[];
  laborLines: string[];
  jobTitle?: string | null;
  clientName?: string | null;
}): string {
  const summary = input.workSummaries.map((s) => s?.trim()).find(Boolean);
  if (summary) return summary;
  const lines = input.laborLines.map((l) => l.trim()).filter((l) => l && !GENERIC_LINE.test(l));
  if (lines.length > 0) return lines.map((l) => `• ${l}`).join("\n");
  const title = input.jobTitle?.trim() ?? "";
  const autoTitle = input.clientName ? title.endsWith(` - ${input.clientName}`) : false;
  return title && !autoTitle ? title : "";
}

/** Trim, drop blanks, cap sizes — records are customer-facing text. */
export function cleanRecords(records: ReportRecord[]): ReportRecord[] {
  return records
    .map((r) => ({ label: r.label.trim().slice(0, 120), detail: r.detail.trim().slice(0, 300) }))
    .filter((r) => r.label || r.detail)
    .slice(0, 30);
}
