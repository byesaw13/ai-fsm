/**
 * Migration 204 (TASK-179): prepared scope on estimates.
 *
 * Tier: database integration. Skips without TEST_DATABASE_URL.
 * Checks the one-open-draft-per-visit rule and that a prepared scope survives
 * a Postgres round trip.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePreparedScope, type PreparedScope } from "@ai-fsm/domain";

const enabled = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)("migration 204 — prepared scope on estimates", () => {
  const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const accountId = randomUUID();
  const userId = randomUUID();
  const clientId = randomUUID();
  const jobId = randomUUID();
  const visitId = randomUUID();

  async function insertEstimate(status: string, sourceVisitId: string | null, preparedScope: unknown = null) {
    const id = randomUUID();
    await db.query(
      `INSERT INTO estimates (id, account_id, client_id, job_id, status, created_by, source_visit_id, prepared_scope)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, accountId, clientId, jobId, status, userId, sourceVisitId, preparedScope === null ? null : JSON.stringify(preparedScope)],
    );
    return id;
  }

  beforeAll(async () => {
    await db.query("INSERT INTO accounts (id, name) VALUES ($1, 'Migration 204')", [accountId]);
    await db.query(
      `INSERT INTO users (id, account_id, email, full_name, password_hash, role)
       VALUES ($1, $2, $3, 'M204 owner', 'x', 'owner')`,
      [userId, accountId, `m204-${userId}@test.invalid`],
    );
    await db.query("INSERT INTO clients (id, account_id, name) VALUES ($1, $2, 'M204 client')", [clientId, accountId]);
    await db.query(
      "INSERT INTO jobs (id, account_id, client_id, title, created_by) VALUES ($1, $2, $3, 'M204 job', $4)",
      [jobId, accountId, clientId, userId],
    );
    await db.query(
      `INSERT INTO visits (id, account_id, job_id, visit_type, scheduled_start, scheduled_end)
       VALUES ($1, $2, $3, 'site_visit', now(), now() + interval '1 hour')`,
      [visitId, accountId, jobId],
    );
  });

  afterAll(async () => {
    await db.query("DELETE FROM accounts WHERE id = $1", [accountId]);
    await db.end();
  });

  it("allows only one open draft per source visit", async () => {
    await insertEstimate("draft", visitId);
    await expect(insertEstimate("draft", visitId)).rejects.toMatchObject({ code: "23505" });
  });

  it("does not limit sent quotes or estimates without a source visit", async () => {
    await insertEstimate("sent", visitId);
    await insertEstimate("draft", null);
    await insertEstimate("draft", null);
  });

  it("keeps a prepared scope through a round trip", async () => {
    const otherVisit = randomUUID();
    await db.query(
      `INSERT INTO visits (id, account_id, job_id, visit_type, scheduled_start, scheduled_end)
       VALUES ($1, $2, $3, 'site_visit', now(), now() + interval '1 hour')`,
      [otherVisit, accountId, jobId],
    );
    const scope: PreparedScope = {
      version: 1,
      source: { visit_id: otherVisit, assessment_id: null, assessment_updated_at: null },
      groups: [{ key: "bath", label: "Bathroom" }],
      tasks: [
        {
          id: "t1",
          room_id: "r4",
          description: "Paint ceiling",
          kind: "requested",
          confirmed: true,
          group_key: "bath",
          quantity_key: "ceiling_sqft",
          count: null,
          quantity: { key: "ceiling_sqft", value: 96, unit: "sqft", basis: "measured" },
          hours_low: 2,
          hours_high: 3,
          hours_source: "ai_allowance",
          materials_cents: null,
        },
      ],
      questions: [{ id: "q1", task_ids: ["t1"], text: "Same color as walls?", answer: null }],
      alternatives: [],
      exclusions: ["Concealed subfloor damage"],
    };
    const id = await insertEstimate("draft", otherVisit, scope);
    const { rows } = await db.query("SELECT prepared_scope FROM estimates WHERE id = $1", [id]);
    expect(parsePreparedScope(rows[0].prepared_scope)).toEqual(scope);
  });

  it("adds a nullable group key to line items", async () => {
    const { rows } = await db.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'estimate_line_items' AND column_name = 'prepared_group_key'`,
    );
    expect(rows[0]?.is_nullable).toBe("YES");
  });
});
