/**
 * DB integration: assessment complete → site visit auto-close cascade.
 *
 * Tier 2 — requires TEST_DATABASE_URL with migrations applied.
 * Runs in a rolled-back transaction; no server needed.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import type { PoolClient } from "pg";
import { completeAssessmentCascade, sendEstimateCascade } from "../cascades";

const RUN = !!process.env.TEST_DATABASE_URL;
const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";
const TRACE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TRACE_AMEND = "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff";

describe.skipIf(!RUN)("completeAssessmentCascade (integration)", () => {
  let client: Client;
  let jobId = "";
  let visitId = "";
  const assessmentCompletedAt = "2026-07-02T14:30:00.000Z";

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_account_id',$1,true),
              set_config('app.current_user_id',$2,true),
              set_config('app.current_role','owner',true)`,
      [ACCOUNT, OWNER],
    );

    await client.query(
      `INSERT INTO accounts (id, name) VALUES ($1, 'cascade-test account')
       ON CONFLICT (id) DO NOTHING`,
      [ACCOUNT],
    );
    await client.query(
      `INSERT INTO users (id, account_id, email, full_name, password_hash, role)
       VALUES ($1, $2, 'cascade-owner@test.local', 'Cascade Owner', 'x', 'owner')
       ON CONFLICT (id) DO NOTHING`,
      [OWNER, ACCOUNT],
    );

    const c = await client.query<{ id: string }>(
      `INSERT INTO clients (account_id, name) VALUES ($1,'cascade-test client') RETURNING id`,
      [ACCOUNT],
    );
    const clientId = c.rows[0].id;

    const job = await client.query<{ id: string }>(
      `INSERT INTO jobs (account_id, client_id, title, status, job_type, created_by)
       VALUES ($1,$2,'Cascade test project','draft','custom',$3) RETURNING id`,
      [ACCOUNT, clientId, OWNER],
    );
    jobId = job.rows[0].id;

    const visit = await client.query<{ id: string }>(
      `INSERT INTO visits (account_id, job_id, scheduled_start, scheduled_end, visit_type, status)
       VALUES ($1,$2, now(), now() + interval '1 hour', 'site_visit', 'in_progress')
       RETURNING id`,
      [ACCOUNT, jobId],
    );
    visitId = visit.rows[0].id;

    await client.query(
      `INSERT INTO site_visit_assessments (visit_id, account_id, rooms, scope_notes, created_by)
       VALUES ($1, $2, $3, 'Initial scope', $4)`,
      [
        visitId,
        ACCOUNT,
        JSON.stringify([{ id: "room-1", name: "Living Room", length_ft: 12, width_ft: 14 }]),
        OWNER,
      ],
    );
  });

  afterAll(async () => {
    if (!RUN) return;
    await client.query("ROLLBACK");
    await client.end();
  });

  const poolClient = () => client as unknown as PoolClient;

  async function visitStatus() {
    const r = await client.query<{ status: string; completed_at: Date | null }>(
      `SELECT status, completed_at FROM visits WHERE id = $1`,
      [visitId],
    );
    return r.rows[0];
  }

  async function jobStatus() {
    const r = await client.query<{ status: string }>(
      `SELECT status FROM jobs WHERE id = $1`,
      [jobId],
    );
    return r.rows[0].status;
  }

  it("completes site visit when assessment is marked complete; job stays draft", async () => {
    await completeAssessmentCascade(poolClient(), {
      visitId,
      accountId: ACCOUNT,
      userId: OWNER,
      traceId: TRACE,
      assessmentCompletedAt: assessmentCompletedAt,
    });

    const visit = await visitStatus();
    expect(visit.status).toBe("completed");
    expect(visit.completed_at).toBeTruthy();
    expect(new Date(visit.completed_at!).toISOString()).toBe(assessmentCompletedAt);
    expect(await jobStatus()).toBe("draft");

    const audit = await client.query<{ action: string; new_value: { status: string } }>(
      `SELECT action, new_value
       FROM audit_log
       WHERE entity_type = 'visit' AND entity_id = $1 AND trace_id = $2`,
      [visitId, TRACE],
    );
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].action).toBe("update");
    expect(audit.rows[0].new_value.status).toBe("completed");
  });

  it("completes a scheduled site visit (Joseph Legerstee pattern)", async () => {
    await client.query(
      `UPDATE visits SET status = 'scheduled', completed_at = NULL WHERE id = $1`,
      [visitId],
    );

    await completeAssessmentCascade(poolClient(), {
      visitId,
      accountId: ACCOUNT,
      userId: OWNER,
      traceId: "aaaaaaaa-bbbb-cccc-dddd-111111111111",
      assessmentCompletedAt: assessmentCompletedAt,
    });

    const visit = await visitStatus();
    expect(visit.status).toBe("completed");
    expect(new Date(visit.completed_at!).toISOString()).toBe(assessmentCompletedAt);
    expect(await jobStatus()).toBe("draft");
  });

  it("amending a completed assessment does not reopen the visit (idempotent)", async () => {
    await client.query(
      `UPDATE site_visit_assessments
       SET scope_notes = 'Amended scope', completed_at = $2
       WHERE visit_id = $1`,
      [visitId, assessmentCompletedAt],
    );

    await completeAssessmentCascade(poolClient(), {
      visitId,
      accountId: ACCOUNT,
      userId: OWNER,
      traceId: TRACE_AMEND,
      assessmentCompletedAt: assessmentCompletedAt,
    });

    const visit = await visitStatus();
    expect(visit.status).toBe("completed");
    expect(new Date(visit.completed_at!).toISOString()).toBe(assessmentCompletedAt);
    expect(await jobStatus()).toBe("draft");
  });
});

const TRACE_SEND = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TRACE_RESEND = "bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc";

describe.skipIf(!RUN)("sendEstimateCascade (integration)", () => {
  let client: Client;
  let jobId = "";
  let estimateId = "";
  let sentAt: Date | null = null;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_account_id',$1,true),
              set_config('app.current_user_id',$2,true),
              set_config('app.current_role','owner',true)`,
      [ACCOUNT, OWNER],
    );

    await client.query(
      `INSERT INTO accounts (id, name) VALUES ($1, 'cascade-send-test account')
       ON CONFLICT (id) DO NOTHING`,
      [ACCOUNT],
    );
    await client.query(
      `INSERT INTO users (id, account_id, email, full_name, password_hash, role)
       VALUES ($1, $2, 'cascade-send-owner@test.local', 'Cascade Send Owner', 'x', 'owner')
       ON CONFLICT (id) DO NOTHING`,
      [OWNER, ACCOUNT],
    );

    const c = await client.query<{ id: string }>(
      `INSERT INTO clients (account_id, name) VALUES ($1,'cascade-send client') RETURNING id`,
      [ACCOUNT],
    );
    const clientId = c.rows[0].id;

    const job = await client.query<{ id: string }>(
      `INSERT INTO jobs (account_id, client_id, title, status, job_type, created_by)
       VALUES ($1,$2,'Send cascade test project','draft','custom',$3) RETURNING id`,
      [ACCOUNT, clientId, OWNER],
    );
    jobId = job.rows[0].id;

    const estimate = await client.query<{ id: string }>(
      `INSERT INTO estimates (account_id, client_id, job_id, status, subtotal_cents, total_cents, created_by)
       VALUES ($1,$2,$3,'draft',10000,10000,$4) RETURNING id`,
      [ACCOUNT, clientId, jobId, OWNER],
    );
    estimateId = estimate.rows[0].id;
  });

  afterAll(async () => {
    if (!RUN) return;
    await client.query("ROLLBACK");
    await client.end();
  });

  const poolClient = () => client as unknown as PoolClient;

  async function jobStatus() {
    const r = await client.query<{ status: string }>(
      `SELECT status FROM jobs WHERE id = $1`,
      [jobId],
    );
    return r.rows[0].status;
  }

  async function estimateState() {
    const r = await client.query<{
      status: string;
      expires_at: Date | null;
      sent_at: Date | null;
    }>(
      `SELECT status, expires_at, sent_at FROM estimates WHERE id = $1`,
      [estimateId],
    );
    return r.rows[0];
  }

  it("draft job + draft estimate → send cascade sets job quoted, estimate sent, expires_at ~30 days", async () => {
    await sendEstimateCascade(poolClient(), {
      estimateId,
      accountId: ACCOUNT,
      userId: OWNER,
      traceId: TRACE_SEND,
      jobId,
    });

    await client.query(
      `UPDATE estimates SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1`,
      [estimateId],
    );

    const estimate = await estimateState();
    expect(estimate.status).toBe("sent");
    expect(estimate.expires_at).toBeTruthy();

    const daysUntilExpiry = Math.round(
      (estimate.expires_at!.getTime() - Date.now()) / 86_400_000,
    );
    expect(daysUntilExpiry).toBeGreaterThanOrEqual(29);
    expect(daysUntilExpiry).toBeLessThanOrEqual(31);

    expect(await jobStatus()).toBe("quoted");
    sentAt = estimate.sent_at;

    const audit = await client.query<{ action: string; new_value: { status: string } }>(
      `SELECT action, new_value
       FROM audit_log
       WHERE entity_type = 'job' AND entity_id = $1 AND trace_id = $2`,
      [jobId, TRACE_SEND],
    );
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].action).toBe("update");
    expect(audit.rows[0].new_value.status).toBe("quoted");
  });

  it("job already quoted + cascade again → job stays quoted", async () => {
    await sendEstimateCascade(poolClient(), {
      estimateId,
      accountId: ACCOUNT,
      userId: OWNER,
      traceId: TRACE_RESEND,
      jobId,
    });

    expect(await jobStatus()).toBe("quoted");

    const estimate = await estimateState();
    expect(estimate.sent_at?.toISOString()).toBe(sentAt?.toISOString());

    const resendAudit = await client.query(
      `SELECT id FROM audit_log
       WHERE entity_type = 'job' AND entity_id = $1 AND trace_id = $2`,
      [jobId, TRACE_RESEND],
    );
    expect(resendAudit.rows.length).toBe(0);
  });
});