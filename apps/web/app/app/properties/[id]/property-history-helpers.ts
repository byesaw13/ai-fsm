// Pure helper functions for the Property History page.
// Isolated here so tests can import without touching Next.js server components.

// Real DB job status values. Pipeline stage names are derived — not stored.
export const ACTIVE_JOB_STATUSES_EXCLUDED = ["completed", "invoiced", "cancelled"] as const;

export function propertyActiveJobStatusColor(status: string): string {
  switch (status) {
    case "in_progress": return "#0284c7";
    case "scheduled":   return "#0284c7";
    case "quoted":      return "#d97706";
    case "draft":       return "#6b7280";
    default:            return "#6b7280";
  }
}

export function formatPropertyCents(cents: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatPropertyDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export const NOTE_SOURCE_LABELS: Record<string, string> = {
  owner:      "Owner",
  technician: "Tech",
  office:     "Office",
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  estimate_pdf:    "Estimate",
  estimate_docx:   "Estimate (Word)",
  invoice_pdf:     "Invoice",
  invoice_docx:    "Invoice (Word)",
  receipt:         "Receipt",
  photo:           "Photo",
  signed_approval: "Signed Approval",
  insurance:       "Insurance",
  contract:        "Contract",
  client_file:     "Client File",
  sop:             "SOP",
  template:        "Template",
  other:           "Document",
};
