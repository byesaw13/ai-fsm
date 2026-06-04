// Pure helper functions for the Client 360 page.
// Kept in a separate file so they can be imported by tests without pulling in
// the Next.js server component or its database dependencies.

// Real DB job status values: draft | quoted | scheduled | in_progress | completed | invoiced | cancelled
// Pipeline stage names (new_lead, estimate_needed, approved_ready, etc.) are computed — not stored.
export const ACTIVE_JOB_STATUSES_EXCLUDED = ["completed", "invoiced", "cancelled"] as const;

export function activeJobStatusColor(status: string): string {
  switch (status) {
    case "in_progress": return "#0284c7";
    case "scheduled":   return "#0284c7";
    case "quoted":      return "#d97706"; // estimate sent, awaiting client approval
    case "draft":       return "#6b7280";
    default:            return "#6b7280";
  }
}

export function dollars(cents: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}
