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

describe("upsertLaborLineFromTrackedTime", () => {
  it("updates an existing labor line instead of inserting a duplicate", async () => {
    const client = makeClient([
      { rows: [{ tracked_minutes: "130" }], rowCount: 1 },
      { rows: [{ id: "line-1" }], rowCount: 1 },
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
    expect(client.query).toHaveBeenCalledTimes(3);
    expect((client.query as ReturnType<typeof vi.fn>).mock.calls[2][0]).toContain("UPDATE invoice_line_items");
  });

  it("inserts one labor line when no labor line exists", async () => {
    const client = makeClient([
      { rows: [{ tracked_minutes: "90" }], rowCount: 1 },
      { rows: [], rowCount: 0 },
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
    expect((client.query as ReturnType<typeof vi.fn>).mock.calls[2][0]).toContain("INSERT INTO invoice_line_items");
  });
});
