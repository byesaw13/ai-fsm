export type HandoffInvoice = {
  id: string;
  invoice_kind: string;
  invoice_number: string;
  status: string;
  total_cents: number;
  balance_cents: number;
};

/** Live deposit/final only — voided invoices are not the active handoff. */
export function selectActiveHandoffInvoices(rows: HandoffInvoice[]): {
  depositInvoice: HandoffInvoice | null;
  finalInvoice: HandoffInvoice | null;
} {
  const live = rows.filter((r) => r.status !== "void");
  return {
    depositInvoice: live.find((r) => r.invoice_kind === "deposit") ?? null,
    finalInvoice: live.find((r) => r.invoice_kind === "final") ?? null,
  };
}
