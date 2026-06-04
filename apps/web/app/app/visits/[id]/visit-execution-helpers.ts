// Pure helper functions for the Visit Execution page.
// Isolated for testability — no Next.js or DB dependencies.

// Real DB visit status values.
export const ACTIVE_VISIT_STATUSES = ["scheduled", "arrived", "in_progress"] as const;
export const TERMINAL_VISIT_STATUSES = ["completed", "cancelled"] as const;

export type ActiveVisitStatus = (typeof ACTIVE_VISIT_STATUSES)[number];
export type TerminalVisitStatus = (typeof TERMINAL_VISIT_STATUSES)[number];

// Property context is shown while the visit is active — helps techs prepare.
// It is hidden for completed/cancelled visits (no longer relevant for execution).
export function shouldShowPropertyContext(status: string): boolean {
  return (ACTIVE_VISIT_STATUSES as readonly string[]).includes(status);
}

// Follow-up panel appears only on completed visits.
export function shouldShowFollowUp(status: string): boolean {
  return status === "completed";
}

// Completion record is shown for completed visits.
export function shouldShowCompletionRecord(status: string): boolean {
  return status === "completed";
}

export const ISSUE_SEVERITY_COLORS: Record<string, { fg: string; bg: string }> = {
  minor:    { fg: "#6b7280", bg: "#f3f4f6" },
  moderate: { fg: "#d97706", bg: "#fef3c7" },
  major:    { fg: "#dc2626", bg: "#fee2e2" },
  critical: { fg: "#7f1d1d", bg: "#fecaca" },
};

export const NOTE_SOURCE_DISPLAY: Record<string, string> = {
  owner:      "Owner",
  technician: "Tech",
  office:     "Office",
};

export function formatContextDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Returns the URL to pre-fill a new estimate from a completed visit.
export function buildEstimateUrl(opts: {
  clientId: string | null;
  jobId: string | null;
  propertyId: string | null;
  visitId: string;
}): string | null {
  if (!opts.clientId) return null;
  const params = new URLSearchParams({ client_id: opts.clientId });
  if (opts.jobId)      params.set("job_id", opts.jobId);
  if (opts.propertyId) params.set("property_id", opts.propertyId);
  params.set("from_visit", opts.visitId);
  params.set("pricing_mode", "flat_rate");
  return `/app/estimates/new?${params.toString()}`;
}
