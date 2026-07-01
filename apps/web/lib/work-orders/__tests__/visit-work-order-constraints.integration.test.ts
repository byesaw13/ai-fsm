/**
 * DB integration: visit_type ↔ work_order_id constraints (migration 137).
 *
 * Tier 2 — requires TEST_DATABASE_URL with migrations applied.
 * Runs in a rolled-back transaction; no server needed.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL;
const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";
const CLIENT = "22222222-2222-2222-2222-222222222222";

async function expectDbError(promise: Promise<unknown>, fragment: string) {
  await expect(promise).rejects.toThrow(new RegExp(fragment, "i"));
}

describe.skipIf(!RUN)("visit ↔ work order DB constraints (migration 137)", () => {
  let client: Client;
  let hasMigration = false;
  let jobId = "";
  let readyWoId = "";
  let draftWoId = "";
  let otherJobId = "";

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();

    const col = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'visits' AND column_name = 'work_order_id'
       ) AS exists`,
    );
    hasMigration = col.rows[0]?.exists ?? false;
    if (!hasMigration) return;

    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_account_id',$1,true),
              set_config('app.current_user_id',$2,true),
              set_config('app.current_role','owner',true)`,
      [ACCOUNT, OWNER],
    );

    const job = await client.query<{ id: string }>(
      `INSERT INTO jobs (account_id, client_id, title, status, job_type, created_by)
       VALUES ($1,$2,'Constraint test project','quoted','custom',$3) RETURNING id`,
      [ACCOUNT, CLIENT, OWNER],
    );
    jobId = job.rows[0].id;

    const otherJob = await client.query<{ id: string }>(
      `INSERT INTO jobs (account_id, client_id, title, status, job_type, created_by)
       VALUES ($1,$2,'Other project','quoted','custom',$3) RETURNING id`,
      [ACCOUNT, CLIENT, OWNER],
    );
    otherJobId = otherJob.rows[0].id;

    const readyWo = await client.query<{ id: string }>(
      `INSERT INTO work_orders (account_id, client_id, job_id, title, status, created_by)
       VALUES ($1,$2,$3,'Ready packet','ready',$4) RETURNING id`,
      [ACCOUNT, CLIENT, jobId, OWNER],
    );
    readyWoId = readyWo.rows[0].id;

    const draftWo = await client.query<{ id: string }>(
      `INSERT INTO work_orders (account_id, client_id, title, status, created_by)
       VALUES ($1,$2,'Draft packet','draft',$3) RETURNING id`,
      [ACCOUNT, CLIENT, OWNER],
    );
    draftWoId = draftWo.rows[0].id;
  });

  afterAll(async () => {
    if (!RUN) return;
    if (hasMigration) await client.query("ROLLBACK");
    await client.end();
  });

  it("requires work_order_id for standard visits", async () => {
    if (!hasMigration) return;
    await expectDbError(
      client.query(
        `INSERT INTO visits (account_id, job_id, scheduled_start, scheduled_end, visit_type)
         VALUES ($1,$2, now(), now() + interval '1 hour', 'standard')`,
        [ACCOUNT, jobId],
      ),
      "work_order_id",
    );
  });

  it("forbids work_order_id on operational site_visit", async () => {
    if (!hasMigration) return;
    await expectDbError(
      client.query(
        `INSERT INTO visits (account_id, job_id, work_order_id, scheduled_start, scheduled_end, visit_type)
         VALUES ($1,$2,$3, now(), now() + interval '1 hour', 'site_visit')`,
        [ACCOUNT, jobId, readyWoId],
      ),
      "work_order_id",
    );
  });

  it("rejects visits on draft work orders", async () => {
    if (!hasMigration) return;
    await expectDbError(
      client.query(
        `INSERT INTO visits (account_id, job_id, work_order_id, scheduled_start, scheduled_end, visit_type)
         VALUES ($1,$2,$3, now(), now() + interval '1 hour', 'standard')`,
        [ACCOUNT, jobId, draftWoId],
      ),
      "draft work orders cannot have visits",
    );
  });

  it("rejects job_id mismatch between visit and work order", async () => {
    if (!hasMigration) return;
    await expectDbError(
      client.query(
        `INSERT INTO visits (account_id, job_id, work_order_id, scheduled_start, scheduled_end, visit_type)
         VALUES ($1,$2,$3, now(), now() + interval '1 hour', 'standard')`,
        [ACCOUNT, otherJobId, readyWoId],
      ),
      "job_id must match",
    );
  });

  it("allows operational site_visit without work_order_id", async () => {
    if (!hasMigration) return;
    const res = await client.query<{ id: string }>(
      `INSERT INTO visits (account_id, job_id, scheduled_start, scheduled_end, visit_type)
       VALUES ($1,$2, now(), now() + interval '1 hour', 'site_visit')
       RETURNING id`,
      [ACCOUNT, jobId],
    );
    expect(res.rows[0]?.id).toBeTruthy();
  });
});