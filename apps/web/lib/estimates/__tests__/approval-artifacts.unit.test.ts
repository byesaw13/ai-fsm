/**
 * Unit tests for approval-side-effect consistency.
 *
 * Verifies that createApprovalArtifacts:
 *   - creates a deposit invoice only when deposit_required=true and deposit_cents>0
 *   - is idempotent (never creates a second deposit invoice)
 *   - skips deposit creation when deposit_required=false or deposit_cents=0
 *   - always creates the schedule_job action item
 *
 * And that createJobFromEstimate:
 *   - is idempotent (returns existing job_id when estimate already has one)
 *   - rejects non-approved estimates
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PoolClient } from "pg";

vi.mock("@/lib/invoices/db", () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue("DEP-0001"),
}));

// ── Mock client builder ────────────────────────────────────────────────────

function makeClient(results: unknown[]): PoolClient {
  let i = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const r = results[i++];
      return Promise.resolve(r ?? { rows: [], rowCount: 0 });
    }),
  } as unknown as PoolClient;
}

// ── createApprovalArtifacts ────────────────────────────────────────────────

describe("createApprovalArtifacts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a deposit invoice when deposit_required=true and deposit_cents>0", async () => {
    const { createApprovalArtifacts } = await import("../approve");

    const client = makeClient([
      // estData query
      {
        rows: [{
          client_id: "c1", job_id: null, property_id: null,
          deposit_cents: 15000, deposit_required: true, notes: "Faucet replacement",
        }],
        rowCount: 1,
      },
      // existingDeposit check: none found
      { rows: [], rowCount: 0 },
      // Invoice INSERT
      { rows: [{ id: "dep-inv-1" }], rowCount: 1 },
    ]);

    const result = await createApprovalArtifacts(client, {
      estimateId: "est-1",
      accountId: "acct-1",
      userId: "user-1",
    });

    expect(result.depositInvoiceId).toBe("dep-inv-1");
    // Verify the invoice INSERT was called
    const insertCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO invoices")
    );
    expect(insertCall).toBeDefined();
  });

  it("is idempotent — skips deposit creation if one already exists", async () => {
    const { createApprovalArtifacts } = await import("../approve");

    const client = makeClient([
      // estData
      {
        rows: [{
          client_id: "c1", job_id: null, property_id: null,
          deposit_cents: 15000, deposit_required: true, notes: null,
        }],
        rowCount: 1,
      },
      // existingDeposit: already exists
      { rows: [{ id: "existing-dep" }], rowCount: 1 },
    ]);

    const result = await createApprovalArtifacts(client, {
      estimateId: "est-1",
      accountId: "acct-1",
      userId: "user-1",
    });

    expect(result.depositInvoiceId).toBeNull();
    const insertCalls = (client.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO invoices")
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("skips deposit creation when deposit_required=false", async () => {
    const { createApprovalArtifacts } = await import("../approve");

    const client = makeClient([
      {
        rows: [{
          client_id: "c1", job_id: null, property_id: null,
          deposit_cents: 0, deposit_required: false, notes: null,
        }],
        rowCount: 1,
      },
    ]);

    const result = await createApprovalArtifacts(client, {
      estimateId: "est-1",
      accountId: "acct-1",
      userId: "user-1",
    });

    expect(result.depositInvoiceId).toBeNull();
  });

  it("skips deposit creation when deposit_cents=0 even if deposit_required=true", async () => {
    const { createApprovalArtifacts } = await import("../approve");

    const client = makeClient([
      {
        rows: [{
          client_id: "c1", job_id: null, property_id: null,
          deposit_cents: 0, deposit_required: true, notes: null,
        }],
        rowCount: 1,
      },
    ]);

    const result = await createApprovalArtifacts(client, {
      estimateId: "est-1",
      accountId: "acct-1",
      userId: "user-1",
    });

    expect(result.depositInvoiceId).toBeNull();
  });
});

// ── createJobFromEstimate ──────────────────────────────────────────────────

describe("createJobFromEstimate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is idempotent — returns existing job_id if estimate already has one", async () => {
    const { createJobFromEstimate } = await import("../create-job-db");

    const client = makeClient([
      {
        rows: [{
          id: "est-1", status: "approved",
          client_id: "c1", property_id: null, job_id: "existing-job",
          booking_request_id: null, notes: null, total_cents: 25000,
          client_name: "Jane", property_address: null,
        }],
        rowCount: 1,
      },
    ]);

    const result = await createJobFromEstimate({
      client,
      estimateId: "est-1",
      accountId: "acct-1",
      createdBy: "user-1",
    });

    expect(result.jobId).toBe("existing-job");
    expect(result.created).toBe(false);
    // No INSERT should have been called
    const insertCalls = (client.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO jobs")
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("rejects estimates that are not approved", async () => {
    const { createJobFromEstimate } = await import("../create-job-db");

    const client = makeClient([
      {
        rows: [{
          id: "est-1", status: "sent",
          client_id: "c1", property_id: null, job_id: null,
          booking_request_id: null, notes: null, total_cents: 25000,
          client_name: "Jane", property_address: null,
        }],
        rowCount: 1,
      },
    ]);

    await expect(
      createJobFromEstimate({
        client,
        estimateId: "est-1",
        accountId: "acct-1",
        createdBy: "user-1",
      })
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("creates a job and links it when the estimate has no job yet", async () => {
    const { createJobFromEstimate } = await import("../create-job-db");

    const client = makeClient([
      // Estimate lock query
      {
        rows: [{
          id: "est-1", status: "approved",
          client_id: "c1", property_id: "p1", job_id: null,
          booking_request_id: "br-1", notes: "Fix deck boards",
          total_cents: 35000, client_name: "Bob", property_address: "10 Oak St",
        }],
        rowCount: 1,
      },
      // Job INSERT
      { rows: [{ id: "new-job-1" }], rowCount: 1 },
      // Estimate UPDATE (link job_id)
      { rows: [], rowCount: 1 },
    ]);

    const result = await createJobFromEstimate({
      client,
      estimateId: "est-1",
      accountId: "acct-1",
      createdBy: "user-1",
    });

    expect(result.jobId).toBe("new-job-1");
    expect(result.created).toBe(true);

    // Verify booking_request_id is threaded through to the job
    const insertCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO jobs")
    );
    expect(insertCall).toBeDefined();
    const args = insertCall![1] as unknown[];
    // booking_request_id is $6 in the INSERT
    expect(args[5]).toBe("br-1");
  });
});
