import type { MembershipCapStatus, MembershipVisitPhase } from "@ai-fsm/domain";

export function computeCapStatus(
  minutesUsed: number,
  capMinutes: number | null
): MembershipCapStatus {
  if (capMinutes === null) return "within_cap";
  return minutesUsed >= capMinutes ? "cap_reached" : "within_cap";
}

export function nextMembershipPhase(
  current: MembershipVisitPhase
): MembershipVisitPhase | null {
  if (current === "health_check") return "included_action";
  if (current === "included_action") return "reporting";
  return null;
}

export const MEMBERSHIP_PHASE_LABELS: Record<MembershipVisitPhase, string> = {
  health_check: "Health Check",
  included_action: "Included Action",
  reporting: "Reporting",
};

export const MEMBERSHIP_PHASE_DESCRIPTIONS: Record<MembershipVisitPhase, string> = {
  health_check: "Walk through the property and assess all systems.",
  included_action: "Perform included preventive work within the labor cap.",
  reporting: "Document findings and generate the visit summary.",
};
