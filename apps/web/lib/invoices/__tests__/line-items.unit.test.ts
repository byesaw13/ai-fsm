import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { roundedQuarterHoursFromMinutes, upsertLaborLineFromTrackedTime } from "../line-items";

function makeClient(results: unknown[]): PoolClient {
  let index = 0;
  return {
    query: vi.fn().mockImplementation(() => Promise.resolve(results[index++] ?? { rows: [], rowCount: 0 })),
  } as unknown as PoolClient;
}

describe("roundedQuarterHoursFromMinutes", () => {
  it("rounds completed minutes to the nearest quarter hour", () => {
    expect(roundedQuarterHoursFromMinutes(0)).toBe(0);
    expect(roundedQuarterHoursFromMinutes(61)).toBe(1);
    expect(roundedQuarterHoursFromMinutes(68)).toBe(1.25);
    expect(roundedQuarterHoursFromMinutes(130)).toBe(2.25);
  });
});

const pricingSettingsRow = {
  labor_cost_cents_per_hour: 5000,
  labor_billing_cents_per_hour: 11500,
  margin_floor_pct: 0.3,
  ma_labor_rate_delta: 0.15,
  minimum_service_fee_cents: 18500,
  half_day_rate_cents: 51500,
  full_day_rate_cents: 98000,
};

describe("upsertLaborLineFromTrackedTime", () => {
  it("updates an existing labor line instead of inserting a duplicate", async () => {
    const client = makeClient([
      { rows: [{ tracked_minutes: "130" }], rowCount: 1 },
      // existing labor line SELECT (before pricing load)
      { rows: [{ id: "line-1" }], rowCount: 1 },
      // business_pricing_settings load
      { rows: [pricingSettingsRow], rowCount: 1 },
      {
        rows: [{
          id: "line-1",
          invoice_id: "invoice-1",
          description: "Labor",
          quantity: 2.25,
          unit_price_cents: 11500,
          total_cents: 25875,
          line_item_type: "labor",
          sort_order: 0,
        }],
        rowCount: 1,
      },
    ]);

    const result = await upsertLaborLineFromTrackedTime(client, "invoice-1", "acct-1", "job-1");

    expect(result.billable_hours).toBe(2.25);
    expect(result.lineItem.id).toBe("line-1");
    expect(client.query).toHaveBeenCalledTimes(4);
    expect((client.query as ReturnType<typeof vi.fn>).mock.calls[3][0]).toContain("UPDATE invoice_line_items");
  });

  it("inserts one labor line when no labor line exists", async () => {
    const client = makeClient([
      { rows: [{ tracked_minutes: "90" }], rowCount: 1 },
      // no existing labor line
      { rows: [], rowCount: 0 },
      // business_pricing_settings load
      { rows: [pricingSettingsRow], rowCount: 1 },
      {
        rows: [{
          id: "line-2",
          invoice_id: "invoice-1",
          description: "Labor",
          quantity: 1.5,
          unit_price_cents: 11500,
          total_cents: 17250,
          line_item_type: "labor",
          sort_order: 0,
        }],
        rowCount: 1,
      },
    ]);

    const result = await upsertLaborLineFromTrackedTime(client, "invoice-1", "acct-1", "job-1");

    expect(result.billable_hours).toBe(1.5);
    expect(result.lineItem.id).toBe("line-2");
    expect((client.query as ReturnType<typeof vi.fn>).mock.calls[3][0]).toContain("INSERT INTO invoice_line_items");
  });
});
