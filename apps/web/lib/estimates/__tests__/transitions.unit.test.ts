import { describe, it, expect } from "vitest";
import { estimateTransitions } from "@ai-fsm/domain";
import { manualEstimateTransitions, NON_MANUAL_ESTIMATE_STATUSES } from "../transitions";

describe("manualEstimateTransitions — sending is the only path to sent", () => {
  it("a draft offers NO manual transitions (only the Send action reaches sent)", () => {
    // estimateTransitions.draft === ['sent']; once sent is removed, nothing remains.
    expect(manualEstimateTransitions("draft")).toEqual([]);
  });

  it("never offers 'sent' as a manual transition from any status", () => {
    for (const status of Object.keys(estimateTransitions) as Array<keyof typeof estimateTransitions>) {
      expect(manualEstimateTransitions(status)).not.toContain("sent");
    }
  });

  it("preserves approved / declined / expired transitions from sent", () => {
    const fromSent = manualEstimateTransitions("sent");
    expect(fromSent).toContain("approved");
    expect(fromSent).toContain("declined");
    expect(fromSent).toContain("expired");
    expect(fromSent).toHaveLength(3);
  });

  it("terminal statuses still have no transitions", () => {
    expect(manualEstimateTransitions("approved")).toEqual([]);
    expect(manualEstimateTransitions("declined")).toEqual([]);
    expect(manualEstimateTransitions("expired")).toEqual([]);
  });

  it("does not mutate the underlying domain transition map", () => {
    // draft→sent must remain a valid domain transition for the send route.
    expect(estimateTransitions.draft).toContain("sent");
  });

  it("sent is the canonical non-manual status", () => {
    expect(NON_MANUAL_ESTIMATE_STATUSES).toContain("sent");
  });
});
