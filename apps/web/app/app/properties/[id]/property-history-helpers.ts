// Pure helper functions for the Property History page.
// Isolated here so tests can import without touching Next.js server components.

import { comingBackStartHereGuide, sendVsHoldGuide } from "@/lib/guide/next-move";

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
  why: string;
  href: string;
  action: string;
};

/**
 * One next move at the house. Priority: do the work, send the bill,
 * follow the quote, assign a covering tech, write start-here.
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
      why: input.startHere,
      href: input.nextVisitHref ?? `/app/visits/${input.nextVisitId}`,
      action: "Open today",
    };
  }
  if (input.unsentBillId) {
    const guide = sendVsHoldGuide();
    return {
      title: "Send the bill",
      detail: guide.why,
      why: guide.why,
      href: `/app/invoices/${input.unsentBillId}`,
      action: "Open bill",
    };
  }
  if (input.openQuoteId) {
    const detail = "A quote is out. The house is waiting on a yes.";
    return {
      title: "Follow up the quote",
      detail,
      why: detail,
      href: `/app/estimates/${input.openQuoteId}`,
      action: "Open quote",
    };
  }
  if (input.nextVisitId && !input.nextVisitAssigned) {
    const detail = "A day is on the calendar with nobody on Today.";
    return {
      title: "Assign covering tech",
      detail,
      why: detail,
      href: input.assignHref ?? `/app/visits/${input.nextVisitId}`,
      action: "Assign",
    };
  }
  if (input.nextVisitId && !input.startHere) {
    const guide = comingBackStartHereGuide();
    return {
      title: guide.move,
      detail: guide.why,
      why: guide.why,
      href: input.nextVisitHref ?? `/app/visits/${input.nextVisitId}`,
      action: "Write it",
    };
  }
  if (input.nextVisitId) {
    const detail = "The covering tech has Today.";
    return {
      title: "Next day is set",
      detail,
      why: detail,
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
