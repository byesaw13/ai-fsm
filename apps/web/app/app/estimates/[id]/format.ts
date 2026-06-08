import type { EstimateStatus } from "@ai-fsm/domain";

export const STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  declined: "Declined",
  expired: "Expired",
};

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
