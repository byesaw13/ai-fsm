import { describe, expect, it } from "vitest";
import { attentionPriority, compareNeedsAttention, type AttentionTone } from "../priority";

function item(label: string, tone: AttentionTone, detail = "", count = 1) {
  return { label, tone, detail, count };
}

describe("attentionPriority", () => {
  it("puts a late promise ahead of overdue money, and overdue money ahead of a receipt", () => {
    const promise = item("Customer Promises", "danger", "Open captured promises");
    const money = item("Collect overdue bills", "danger", "$2,850 outstanding");
    const receipt = item("Receipts not on a job", "warning", "Today’s receipts still unattached");

    expect(attentionPriority(promise).rank).toBeLessThan(attentionPriority(money).rank);
    expect(attentionPriority(money).rank).toBeLessThan(attentionPriority(receipt).rank);
    expect(attentionPriority(promise).reason).toBe("A customer promise is late");
    expect(attentionPriority(money).reason).toBe("Money is late");
  });

  it("does not let a warning receipt outrank warning scheduling just because the tone matches", () => {
    const receipt = item("Receipts not on a job", "warning");
    const schedule = item("Schedule jobs", "warning");
    expect(attentionPriority(schedule).rank).toBeLessThan(attentionPriority(receipt).rank);
  });

  it("raises an expired quote above a quote that is only waiting", () => {
    const expired = item("Follow up quotes", "warning", "2 expired — revise and resend");
    const waiting = item("Follow up quotes", "warning", "Sent estimates awaiting response");
    expect(attentionPriority(expired).reason).toBe("A quote expired");
    expect(attentionPriority(expired).rank).toBeLessThan(attentionPriority(waiting).rank);
  });
});

describe("compareNeedsAttention", () => {
  it("sorts promise, money, blocked work, then cleanup", () => {
    const items = [
      item("Receipts not on a job", "warning", "", 4),
      item("Clear exception lanes", "warning", "", 1),
      item("Collect overdue bills", "danger", "$100 outstanding", 1),
      item("Customer Promises", "warning", "", 1),
      item("Miles not on a job", "warning", "", 9),
    ];
    expect(items.sort(compareNeedsAttention).map((row) => row.label)).toEqual([
      "Customer Promises",
      "Collect overdue bills",
      "Clear exception lanes",
      "Receipts not on a job",
      "Miles not on a job",
    ]);
  });
});
