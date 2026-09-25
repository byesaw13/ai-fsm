import { describe, expect, it } from "vitest";
import { summarizeSpend } from "../spend";

const inv = (o: Partial<Parameters<typeof summarizeSpend>[0][number]>) => ({
  status: "paid", paid_cents: 0, deposit_cents: 0, paid_at: null, sent_at: null, ...o,
});

describe("summarizeSpend", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  it("adds payments and deposit credit, split by year", () => {
    const r = summarizeSpend(
      [
        inv({ paid_cents: 10000, deposit_cents: 5000, paid_at: "2026-03-01T12:00:00Z" }),
        inv({ paid_cents: 20000, paid_at: "2025-06-01T12:00:00Z" }),
        inv({ status: "partial", paid_cents: 3000, sent_at: "2026-08-01T12:00:00Z" }),
      ],
      now,
    );
    expect(r).toEqual({ allTimeCents: 38000, thisYearCents: 18000 });
  });

  it("ignores drafts, voids, and negative deposits", () => {
    const r = summarizeSpend(
      [
        inv({ status: "void", paid_cents: 9999, paid_at: "2026-01-01T12:00:00Z" }),
        inv({ status: "draft", paid_cents: 9999 }),
        inv({ paid_cents: 100, deposit_cents: -50, paid_at: "2026-01-02T12:00:00Z" }),
      ],
      now,
    );
    expect(r).toEqual({ allTimeCents: 100, thisYearCents: 100 });
  });
});
