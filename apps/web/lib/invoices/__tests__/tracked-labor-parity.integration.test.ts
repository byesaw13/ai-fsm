/**
 * Integration test: invoice-labor PARITY between the legacy visit_time_logs source
 * and the new activity_entries bridge (TASK-062).
 *
 * The money path. Before TASK-063 swaps the two invoice-labor readers
 * (final-invoice.ts, line-items.ts) from visit_time_logs to activity_entries, this
 * proves the bridge yields the SAME tracked minutes — and therefore the same
 * billed labor cents — on a controlled, realistic dataset. If the bridge ever
 * diverges (e.g. it starts counting manual time the old timer never recorded, or
 * its filters drift), this test fails and the swap is blocked.
 *
 * Tier: DB integration (Tier 2). Skipped unless TEST_DATABASE_URL is set. No
 * running server needed. Everything runs in a single transaction that ROLLS BACK,
 * so nothing is persisted. See docs/TEST_MATRIX.md.
 *
 *   TEST_DATABASE_URL=postgresql://... pnpm test
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import type { PoolClient } from "pg";
import {
  trackedLaborMinutesFromVisitTimeLogs,
  trackedLaborMinutesFromActivityEntries,
  trackedLaborCents,
} from "../tracked-labor";

const RUN = !!process.env.TEST_DATABASE_URL;

// Seed account + owner from 002_seed_dev.sql (Demo Account).
const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("invoice labor parity — visit_time_logs vs activity_entries bridge", () => {
  let client: Client;
  // Ids created inside the rolled-back transaction.
  let jobA = "";
  let jobB = "";
  let jobEmpty = "";

  // A closed visit timer plus its dual-write activity entry. `min` minutes long.
  async function visitTimer(visitId: string, jobId: string, startISO: string, min: number) {
    await client.query(
      `INSERT INTO visit_time_logs (account_id, visit_id, job_id, user_id, started_at, ended_at)
       VALUES ($1,$2,$3,$4,$5::timestamptz, $5::timestamptz + ($6 || ' minutes')::interval)`,
      [ACCOUNT, visitId, jobId, OWNER, startISO, min],
    );
    await client.query(
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          started_at, ended_at, entity_type, entity_id, source)
       VALUES ($1,$2,$3::date,'job_work','revenue',
          $3::timestamptz, $3::timestamptz + ($4 || ' minutes')::interval, 'visit', $5, 'auto_visit')`,
      [ACCOUNT, OWNER, startISO, min, visitId],
    );
  }

  // An activity_entry with NO visit_time_logs counterpart — used for noise that
  // the bridge must exclude (so it never inflates labor over the legacy source).
  async function noiseActivity(opts: {
    activity_type: string;
    entity_type: string | null;
    entity_id: string | null;
    startISO: string;
    min: number;
    voided?: boolean;
  }) {
    await client.query(
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          started_at, ended_at, entity_type, entity_id, source, voided_at)
       VALUES ($1,$2,$3::date,$4,'office',
          $3::timestamptz, $3::timestamptz + ($5 || ' minutes')::interval, $6, $7, 'manual', $8)`,
      [
        ACCOUNT, OWNER, opts.startISO, opts.activity_type, opts.min,
        opts.entity_type, opts.entity_id, opts.voided ? new Date().toISOString() : null,
      ],
    );
  }

  async function mkVisit(jobId: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO visits (account_id, job_id, scheduled_start, scheduled_end)
       VALUES ($1,$2, now(), now() + interval '1 hour') RETURNING id`,
      [ACCOUNT, jobId],
    );
    return r.rows[0].id;
  }

  beforeAll(async () => {
    if (!RUN) return;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    await client.query("BEGIN");
    // RLS context (no-op under a superuser test role; required under the app role).
    await client.query(
      `SELECT set_config('app.current_account_id',$1,true),
              set_config('app.current_user_id',$2,true),
              set_config('app.current_role','owner',true)`,
      [ACCOUNT, OWNER],
    );

    // Anchor on the seed account/owner when present (CI), but self-bootstrap them
    // otherwise so the test runs against any migrated DB. All inside the rollback.
    await client.query(
      `INSERT INTO accounts (id, name) VALUES ($1, 'parity-test account')
       ON CONFLICT (id) DO NOTHING`,
      [ACCOUNT],
    );
    await client.query(
      `INSERT INTO users (id, account_id, email, full_name, password_hash, role)
       VALUES ($1, $2, 'parity-owner@test.local', 'Parity Owner', 'x', 'owner')
       ON CONFLICT (id) DO NOTHING`,
      [OWNER, ACCOUNT],
    );

    const c = await client.query<{ id: string }>(
      `INSERT INTO clients (account_id, name) VALUES ($1,'parity-test client') RETURNING id`,
      [ACCOUNT],
    );
    const clientId = c.rows[0].id;
    const p = await client.query<{ id: string }>(
      `INSERT INTO properties (account_id, client_id, address) VALUES ($1,$2,'1 Parity Way') RETURNING id`,
      [ACCOUNT, clientId],
    );
    const propertyId = p.rows[0].id;

    const mkJob = async (title: string) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO jobs (account_id, client_id, property_id, title, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [ACCOUNT, clientId, propertyId, title, OWNER],
      );
      return r.rows[0].id;
    };
    jobA = await mkJob("parity job A");
    jobB = await mkJob("parity job B");
    jobEmpty = await mkJob("parity job empty");

    const visitA = await mkVisit(jobA);
    const visitB = await mkVisit(jobB);
    await mkVisit(jobEmpty); // visit exists but no time at all

    // Job A: two real visit timers (90 + 35 = 125 min), mirrored 1:1 in the ledger.
    await visitTimer(visitA, jobA, "2026-03-10T09:00:00Z", 90);
    await visitTimer(visitA, jobA, "2026-03-10T13:00:00Z", 35);

    // Job B: a separate real timer (200 min) — proves job scoping in the bridge.
    await visitTimer(visitB, jobB, "2026-03-11T08:00:00Z", 200);

    // Noise on Job A's visit that the bridge MUST exclude (none has a vtl row, so
    // the legacy source never saw them — the bridge must not either):
    await noiseActivity({ activity_type: "travel", entity_type: "visit", entity_id: visitA, startISO: "2026-03-10T10:40:00Z", min: 60 }); // wrong verb
    await noiseActivity({ activity_type: "job_work", entity_type: "visit", entity_id: visitA, startISO: "2026-03-10T15:00:00Z", min: 45, voided: true }); // voided
    await noiseActivity({ activity_type: "job_work", entity_type: "job", entity_id: jobA, startISO: "2026-03-10T16:00:00Z", min: 70 }); // job-linked, not visit-linked
  });

  afterAll(async () => {
    if (!RUN) return;
    await client.query("ROLLBACK");
    await client.end();
  });

  const cc = () => client as unknown as PoolClient;

  it("job A: bridge reproduces the legacy tracked minutes exactly", async () => {
    const legacy = await trackedLaborMinutesFromVisitTimeLogs(cc(), ACCOUNT, jobA);
    const bridge = await trackedLaborMinutesFromActivityEntries(cc(), ACCOUNT, jobA);
    expect(legacy).toBe(125);
    expect(bridge).toBe(125); // noise (travel/voided/job-linked) excluded
    expect(bridge).toBe(legacy);
  });

  it("job A: billed labor cents are identical (both reader paths share this transform)", async () => {
    const legacy = await trackedLaborMinutesFromVisitTimeLogs(cc(), ACCOUNT, jobA);
    const bridge = await trackedLaborMinutesFromActivityEntries(cc(), ACCOUNT, jobA);
    expect(trackedLaborCents(bridge)).toBe(trackedLaborCents(legacy));
    expect(trackedLaborCents(bridge)).toBeGreaterThan(0);
  });

  it("job B: scoping holds — the bridge counts only its own job's time", async () => {
    const legacy = await trackedLaborMinutesFromVisitTimeLogs(cc(), ACCOUNT, jobB);
    const bridge = await trackedLaborMinutesFromActivityEntries(cc(), ACCOUNT, jobB);
    expect(legacy).toBe(200);
    expect(bridge).toBe(200);
  });

  it("empty job: both sources are zero (no false labor)", async () => {
    const legacy = await trackedLaborMinutesFromVisitTimeLogs(cc(), ACCOUNT, jobEmpty);
    const bridge = await trackedLaborMinutesFromActivityEntries(cc(), ACCOUNT, jobEmpty);
    expect(legacy).toBe(0);
    expect(bridge).toBe(0);
    expect(trackedLaborCents(bridge)).toBe(0);
  });
});
