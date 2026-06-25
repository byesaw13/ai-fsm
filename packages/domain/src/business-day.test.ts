import { describe, it, expect } from "vitest";
import {
  BUSINESS_DAY_STATUSES,
  canTransitionBusinessDay,
  checkBusinessDayTransition,
  isBusinessDayOpen,
  businessDayStatusAfterConcernClosed,
  type BusinessDayStatus,
} from "./business-day";

describe("business-day state machine", () => {
  it("allows the normal day arc OPEN → ACTIVE → READY_TO_CLOSE → CLOSED", () => {
    expect(canTransitionBusinessDay("OPEN", "ACTIVE")).toBe(true);
    expect(canTransitionBusinessDay("ACTIVE", "READY_TO_CLOSE")).toBe(true);
    expect(canTransitionBusinessDay("READY_TO_CLOSE", "CLOSED")).toBe(true);
  });

  it("only reaches CLOSED via READY_TO_CLOSE (the checklist gate)", () => {
    expect(canTransitionBusinessDay("ACTIVE", "CLOSED")).toBe(false);
    expect(canTransitionBusinessDay("OPEN", "CLOSED")).toBe(false);
    expect(canTransitionBusinessDay("PAUSED", "CLOSED")).toBe(false);
    expect(canTransitionBusinessDay("READY_TO_CLOSE", "CLOSED")).toBe(true);
  });

  it("treats reopen as a normal action from CLOSED, then continues working", () => {
    expect(canTransitionBusinessDay("CLOSED", "REOPENED")).toBe(true);
    expect(canTransitionBusinessDay("REOPENED", "ACTIVE")).toBe(true);
    expect(canTransitionBusinessDay("REOPENED", "READY_TO_CLOSE")).toBe(true);
  });

  it("requires a reason to reopen", () => {
    expect(checkBusinessDayTransition("CLOSED", "REOPENED").ok).toBe(false);
    expect(checkBusinessDayTransition("CLOSED", "REOPENED", { reason: "" }).ok).toBe(false);
    expect(checkBusinessDayTransition("CLOSED", "REOPENED", { reason: "emergency call" }).ok).toBe(true);
  });

  it("rejects nonsense transitions with a message", () => {
    const r = checkBusinessDayTransition("CLOSED", "ACTIVE");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Cannot move/);
  });

  it("considers every non-CLOSED status still open for business", () => {
    for (const s of BUSINESS_DAY_STATUSES) {
      expect(isBusinessDayOpen(s)).toBe(s !== "CLOSED");
    }
  });

  it("INVARIANT: closing a sub-concern never changes the day status", () => {
    for (const s of BUSINESS_DAY_STATUSES) {
      expect(businessDayStatusAfterConcernClosed(s as BusinessDayStatus)).toBe(s);
    }
  });
});
