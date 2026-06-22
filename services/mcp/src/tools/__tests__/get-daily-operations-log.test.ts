import { describe, it, expect } from "vitest";
import { run } from "../get-daily-operations-log.js";
import { makeExec, TEST_SESSION } from "./helpers.js";

describe("get_daily_operations_log", () => {
  it("rolls up activities, visits, and payments for a date", async () => {
    const { exec, calls } = makeExec([
      {
        match: /FROM activity_entries/,
        rows: [
          { activity_type: "job_work", category: "revenue", started_at: "2026-06-20T13:00:00Z", ended_at: "2026-06-20T15:00:00Z", note: null, entity_type: "job", entity_id: "j1" },
          { activity_type: "admin", category: "office", started_at: "2026-06-20T16:00:00Z", ended_at: null, note: "open entry", entity_type: null, entity_id: null },
        ],
      },
      {
        match: /FROM visits v/,
        rows: [{ id: "v1", status: "completed", scheduled_start: "2026-06-20T13:00:00Z", scheduled_end: "2026-06-20T15:00:00Z", completed_at: "2026-06-20T15:00:00Z", job_title: "Deck", client_name: "Jane" }],
      },
      {
        match: /FROM payments p/,
        rows: [{ amount_cents: 100000, method: "check", payment_type: "deposit", invoice_number: "INV-1", client_name: "Jane" }],
      },
    ]);

    const result = (await run(exec, TEST_SESSION, { date: "2026-06-20" })) as {
      date: string;
      activities: { count: number; tracked_minutes: number; minutes_by_category: Record<string, number>; entries: Array<{ open: boolean; duration_minutes: number | null }> };
      visits: { count: number; completed: number };
      payments: { total_received: { cents: number } };
    };

    expect(result.date).toBe("2026-06-20");
    expect(result.activities.count).toBe(2);
    expect(result.activities.tracked_minutes).toBe(120);
    expect(result.activities.minutes_by_category.revenue).toBe(120);
    expect(result.activities.entries[1].open).toBe(true);
    expect(result.activities.entries[1].duration_minutes).toBeNull();
    expect(result.visits.completed).toBe(1);
    expect(result.payments.total_received.cents).toBe(100000);
    expect(calls[0].params).toEqual([TEST_SESSION.accountId, "2026-06-20"]);
  });

  it("defaults to today when no date is given", async () => {
    const { exec, calls } = makeExec([
      { match: /FROM activity_entries/, rows: [] },
      { match: /FROM visits v/, rows: [] },
      { match: /FROM payments p/, rows: [] },
    ]);
    const result = (await run(exec, TEST_SESSION, {})) as { date: string };
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calls[0].params?.[1]).toBe(result.date);
  });
});
