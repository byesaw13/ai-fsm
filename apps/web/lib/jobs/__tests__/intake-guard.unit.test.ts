import { describe, expect, it } from "vitest";
import { reviewJobIntakeGate } from "../intake-guard";

describe("reviewJobIntakeGate", () => {
  it("hard-blocks when intake_decision is 'decline'", () => {
    const result = reviewJobIntakeGate({ intake_decision: "decline" });
    expect(result.status).toBe("blocked");
    expect(result.blocker).toMatch(/declined/i);
    expect(result.warning).toBeNull();
  });

  it("returns warning when intake_decision is null", () => {
    const result = reviewJobIntakeGate({ intake_decision: null });
    expect(result.status).toBe("warning");
    expect(result.warning).toMatch(/no intake decision/i);
    expect(result.blocker).toBeNull();
  });

  it("passes when intake_decision is 'accept'", () => {
    const result = reviewJobIntakeGate({ intake_decision: "accept" });
    expect(result.status).toBe("passed");
    expect(result.blocker).toBeNull();
    expect(result.warning).toBeNull();
  });

  it("passes when intake_decision is 'defer'", () => {
    const result = reviewJobIntakeGate({ intake_decision: "defer" });
    expect(result.status).toBe("passed");
    expect(result.blocker).toBeNull();
    expect(result.warning).toBeNull();
  });

  it("passes when intake_decision is 'reframe'", () => {
    const result = reviewJobIntakeGate({ intake_decision: "reframe" });
    expect(result.status).toBe("passed");
    expect(result.blocker).toBeNull();
    expect(result.warning).toBeNull();
  });
});
