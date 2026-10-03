import { describe, expect, it } from "vitest";
import { invoiceReviewExceptions } from "../review-exceptions";

const paint = { id: "1", label: "Paint living room", required: true, completion_outcome: "completed" as string | null };

describe("invoice review exceptions", () => {
  it("is quiet when every required item has a billable outcome", () => {
    expect(invoiceReviewExceptions({
      tasks: [paint],
      lines: [{ description: "Paint living room", line_item_type: "labor" }],
      cardFeePct: 0,
    })).toEqual([]);
  });

  it("flags a required item with no completion state", () => {
    const issues = invoiceReviewExceptions({
      tasks: [{ ...paint, completion_outcome: null }],
      lines: [],
      cardFeePct: 0,
    });
    expect(issues.map((issue) => issue.message)).toEqual(["Paint living room has no completion state."]);
  });

  it("flags deferred work that is still on the invoice", () => {
    const issues = invoiceReviewExceptions({
      tasks: [{ ...paint, completion_outcome: "deferred" }],
      lines: [{ description: "Paint living room walls", line_item_type: "labor" }],
      cardFeePct: 0,
    });
    expect(issues[0]?.message).toContain("deferred");
  });

  it("asks about a card fee only when the policy is on and the invoice has no card-fee line", () => {
    expect(invoiceReviewExceptions({
      tasks: [],
      lines: [],
      cardFeePct: 2.9,
    })[0]?.id).toBe("card-fee");
    expect(invoiceReviewExceptions({
      tasks: [],
      lines: [{ description: "Card fee", line_item_type: "fee" }],
      cardFeePct: 2.9,
    })).toEqual([]);
  });
});
