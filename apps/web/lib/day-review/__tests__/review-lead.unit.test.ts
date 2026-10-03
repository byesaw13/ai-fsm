import { describe, expect, it } from "vitest";
import { dayReviewLead } from "../review-lead";

const clear = {
  unansweredStops: 0,
  suggestedStops: 0,
  answeredStops: 12,
  billsOnHold: 0,
  leftoverReceipts: 0,
  flaggedMiles: false,
  openPromises: 0,
};

describe("dayReviewLead", () => {
  it("collapses a clean day into matched work and no questions", () => {
    expect(dayReviewLead(clear)).toEqual({
      headline: "AI-FSM reconciled this day. Nothing still needs you.",
      needsYou: [],
      handledSummary: "12 stops matched already",
    });
  });

  it("asks to confirm a suggested stop and questions a stop with no match", () => {
    const lead = dayReviewLead({
      ...clear,
      unansweredStops: 2,
      suggestedStops: 1,
      answeredStops: 3,
      billsOnHold: 1,
    });
    expect(lead.headline).toBe("AI-FSM reconciled what it could. These still need you.");
    expect(lead.needsYou[0]).toBe("1 stop looks matched — confirm or change");
    expect(lead.needsYou[1]).toBe("1 stop still needs a reason");
    expect(lead.needsYou).toContain("1 finished job is not billed");
    expect(lead.handledSummary).toBe("3 stops matched already");
  });
});
