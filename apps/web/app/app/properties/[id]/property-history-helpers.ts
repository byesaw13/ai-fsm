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

/** Street address is the house. A nickname wins when someone named it. */
export function houseHeading(name: string | null | undefined, address: string): string {
  const named = name?.trim();
  if (named) return named;
  const street = address.trim();
  return street || "House";
}

/** Coming-back note the next person should see before they walk the house. */
export function houseStartHere(input: {
  firstUp: string | null | undefined;
  nextVisitStart?: string | null;
}): string | null {
  const firstUp = input.firstUp?.trim();
  return firstUp ? firstUp : null;
}

export const NOTE_SOURCE_LABELS: Record<string, string> = {
  owner:      "Owner",
  technician: "Tech",
  office:     "Office",
};

export type HouseWhatsNext = {
  title: string;
  detail: string;
  href: string;
  action: string;
};

/**
 * One next move at the house. Priority: do the work, send the bill,
 * follow the quote, assign a covering tech.
 */
export function houseWhatsNext(input: {
  startHere: string | null;
  nextVisitId: string | null;
  nextVisitAssigned: boolean;
  nextVisitHref?: string | null;
  unsentBillId: string | null;
  openQuoteId: string | null;
  assignHref?: string | null;
}): HouseWhatsNext | null {
  if (input.startHere && input.nextVisitId) {
    return {
      title: "Start here",
      detail: input.startHere,
      href: input.nextVisitHref ?? `/app/visits/${input.nextVisitId}`,
      action: "Open today",
    };
  }
  if (input.unsentBillId) {
    return {
      title: "Send the bill",
      detail: "Work is filed. The bill is still on Hold.",
      href: `/app/invoices/${input.unsentBillId}`,
      action: "Open bill",
    };
  }
  if (input.openQuoteId) {
    return {
      title: "Follow up the quote",
      detail: "A quote is out. The house is waiting on a yes.",
      href: `/app/estimates/${input.openQuoteId}`,
      action: "Open quote",
    };
  }
  if (input.nextVisitId && !input.nextVisitAssigned) {
    return {
      title: "Assign covering tech",
      detail: "A day is on the calendar with nobody on Today.",
      href: input.assignHref ?? `/app/visits/${input.nextVisitId}`,
      action: "Assign",
    };
  }
  if (input.nextVisitId) {
    return {
      title: "Next day is set",
      detail: "The covering tech has Today.",
      href: input.nextVisitHref ?? `/app/visits/${input.nextVisitId}`,
      action: "Open visit",
    };
  }
  return null;
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  estimate_pdf:    "Quote",
  estimate_docx:   "Quote (Word)",
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
