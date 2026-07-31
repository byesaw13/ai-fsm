import { describe, expect, it } from "vitest";
import { buildJobLedger } from "@ai-fsm/domain";
import { buildCoDraftFromLedger } from "../job-ledger-co-draft";

describe("buildCoDraftFromLedger", () => {
  it("builds CO payload from materials overage", () => {
    const ledger = buildJobLedger({
      jobId: "job-1",
      pricingMode: "hourly_internal",
      estimate: {
        id: "est-1",
        number: "EST-2026-0016",
        status: "approved",
        total_cents: 150000,
        line_items: [
          {
            description: "Materials allowance",
            quantity: 1,
            unit_price_cents: 150000,
            total_cents: 150000,
          },
        ],
      },
      trackedLaborMinutes: 0,
      materialsExpenses: [{ amount_cents: 340677 }],
      changeOrders: [],
      paidCents: 0,
    });

    const draft = buildCoDraftFromLedger(ledger);
    expect(draft).not.toBeNull();
    expect(draft!.estimate_id).toBe("est-1");
    expect(draft!.title).toMatch(/Materials/i);
    expect(draft!.line_items[0].unit_price_cents).toBe(190677);
    expect(draft!.description).toContain("EST-2026-0016");
  });

  it("returns null when cannot draft", () => {
    const ledger = buildJobLedger({
      jobId: "job-1",
      pricingMode: "hourly_internal",
      estimate: {
        id: "est-1",
        number: "EST-1",
        status: "sent",
        total_cents: 10000,
        line_items: [
          {
            description: "Materials allowance",
            quantity: 1,
            unit_price_cents: 10000,
            total_cents: 10000,
          },
        ],
      },
      trackedLaborMinutes: 0,
      materialsExpenses: [{ amount_cents: 50000 }],
      changeOrders: [],
      paidCents: 0,
    });
    expect(buildCoDraftFromLedger(ledger)).toBeNull();
  });
});
