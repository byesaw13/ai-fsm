import { describe, it, expect } from "vitest";
import { run } from "../get-job-summary.js";
import { makeExec, TEST_SESSION } from "./helpers.js";

const JOB_ID = "33333333-3333-3333-3333-333333333333";

describe("get_job_summary", () => {
  it("assembles job, visits, estimates and invoice totals", async () => {
    const { exec } = makeExec([
      {
        match: /FROM jobs j/,
        rows: [{ id: JOB_ID, title: "Deck repair", description: null, status: "in_progress", priority: 0, created_at: "2026-06-01", client_id: "c1", client_name: "Jane", property_id: "p1", address: "1 Main", city: "Town", state: "VA", zip: "22000" }],
      },
      {
        match: /FROM visits/,
        rows: [{ id: "v1", status: "completed", scheduled_start: "2026-06-02", scheduled_end: "2026-06-02", arrived_at: null, completed_at: "2026-06-02", assigned_user_id: "u1" }],
      },
      { match: /FROM estimates/, rows: [{ id: "e1", status: "approved", total_cents: 400000 }] },
      {
        match: /FROM invoices/,
        rows: [{ id: "i1", invoice_number: "INV-1", status: "partial", total_cents: 400000, paid_cents: 100000 }],
      },
    ]);

    const result = (await run(exec, TEST_SESSION, { job_id: JOB_ID })) as {
      job: { title: string };
      property: { address: string } | null;
      visits: { count: number; entries: Array<{ assigned: boolean }> };
      invoices: { total_invoiced: { cents: number }; balance: { cents: number } };
    };

    expect(result.job.title).toBe("Deck repair");
    expect(result.property?.address).toBe("1 Main");
    expect(result.visits.count).toBe(1);
    expect(result.visits.entries[0].assigned).toBe(true);
    expect(result.invoices.total_invoiced.cents).toBe(400000);
    expect(result.invoices.balance.cents).toBe(300000);
  });

  it("throws for a job outside the account", async () => {
    const { exec } = makeExec([{ match: /FROM jobs j/, rows: [] }]);
    await expect(run(exec, TEST_SESSION, { job_id: JOB_ID })).rejects.toThrow(/No job/);
  });
});
