/**
 * Integration test: invoice-labor bridge correctness (activity_entries source).
 *
 * activity_entries is the single source of truth for invoice labor (Time Truth
 * Consolidation, EPIC-001). This locks in that the bridge query
 * (trackedLaborMinutesFromActivityEntries) sums exactly the right time — job_work
 * on the visit, scoped to the job — and excludes everything else.
 *
 * History: this began as the TASK-062 parity test (activity_entries vs the legacy
 * visit_time_logs). visit_time_logs was retired in TASK-065, so the legacy side is
 * gone; what remains is the bridge's own correctness.
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
  trackedLaborMinutesFromActivityEntries,
  trackedLaborCents,
  roundedQuarterHoursFromMinutes,
} from "../tracked-labor";
import { upsertLaborLineFromTrackedTime } from "../line-items";

const RUN = !!process.env.TEST_DATABASE_URL;

// Seed account + owner from 002_seed_dev.sql (Demo Account).
const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("invoice labor bridge — activity_entries source of truth", () => {
  let client: Client;
  // Ids created inside the rolled-back transaction.
  let jobA = "";
  let jobB = "";
  let jobEmpty = "";
  let invoiceA = ""; // draft invoice for jobA, for the end-to-end money-path test

  // A closed job_work segment on a visit — what the visit transition route writes
  // when a visit starts/ends. `min` minutes long.
  async function jobWorkOnVisit(visitId: string, startISO: string, min: number) {
    await client.query(
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          started_at, ended_at, entity_type, entity_id, source)
       VALUES ($1,$2,$3::date,'job_work','revenue',
          $3::timestamptz, $3::timestamptz + ($4 || ' minutes')::interval, 'visit', $5, 'auto_visit')`,
      [ACCOUNT, OWNER, startISO, min, visitId],
    );
  }

  // An activity_entry the bridge must EXCLUDE (so it never inflates labor).
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
      `INSERT INTO accounts (id, name) VALUES ($1, 'bridge-test account')
       ON CONFLICT (id) DO NOTHING`,
      [ACCOUNT],
    );
    await client.query(
      `INSERT INTO users (id, account_id, email, full_name, password_hash, role)
       VALUES ($1, $2, 'bridge-owner@test.local', 'Bridge Owner', 'x', 'owner')
       ON CONFLICT (id) DO NOTHING`,
      [OWNER, ACCOUNT],
    );

    const c = await client.query<{ id: string }>(
      `INSERT INTO clients (account_id, name) VALUES ($1,'bridge-test client') RETURNING id`,
      [ACCOUNT],
    );
    const clientId = c.rows[0].id;
    const p = await client.query<{ id: string }>(
      `INSERT INTO properties (account_id, client_id, address) VALUES ($1,$2,'1 Bridge Way') RETURNING id`,
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
    jobA = await mkJob("bridge job A");
    jobB = await mkJob("bridge job B");
    jobEmpty = await mkJob("bridge job empty");

    const inv = await client.query<{ id: string }>(
      `INSERT INTO invoices (account_id, client_id, job_id, invoice_number, created_by)
       VALUES ($1,$2,$3,'BRIDGE-TEST-1',$4) RETURNING id`,
      [ACCOUNT, clientId, jobA, OWNER],
    );
    invoiceA = inv.rows[0].id;

    const visitA = await mkVisit(jobA);
    const visitB = await mkVisit(jobB);
    await mkVisit(jobEmpty); // visit exists but no time at all

    // Job A: two job_work segments on its visit (90 + 35 = 125 min).
    await jobWorkOnVisit(visitA, "2026-03-10T09:00:00Z", 90);
    await jobWorkOnVisit(visitA, "2026-03-10T13:00:00Z", 35);

    // Job B: a separate segment (200 min) — proves job scoping in the bridge.
    await jobWorkOnVisit(visitB, "2026-03-11T08:00:00Z", 200);

    // Noise on Job A's visit that the bridge MUST exclude:
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

  it("job A: sums only its job_work-on-visit time (noise excluded)", async () => {
    const minutes = await trackedLaborMinutesFromActivityEntries(cc(), ACCOUNT, jobA);
    expect(minutes).toBe(125); // travel / voided / job-linked all excluded
  });

  it("job A: billed labor cents derive from the bridge minutes", async () => {
    const minutes = await trackedLaborMinutesFromActivityEntries(cc(), ACCOUNT, jobA);
    expect(trackedLaborCents(minutes)).toBeGreaterThan(0);
  });

  it("money path: the labor reader writes bridge-derived cents to the invoice line", async () => {
    // End-to-end through the real reader (activity_entries -> upsertLaborLineFromTrackedTime
    // -> invoice_line_items). This is the money-path guard: a reader/filter change
    // that altered billed labor would change these numbers and fail here.
    const { lineItem, tracked_minutes, billable_hours } =
      await upsertLaborLineFromTrackedTime(cc(), invoiceA, ACCOUNT, jobA);
    expect(tracked_minutes).toBe(125);
    expect(billable_hours).toBe(roundedQuarterHoursFromMinutes(125));
    expect(lineItem.line_item_type).toBe("labor");
    expect(lineItem.total_cents).toBe(trackedLaborCents(125));
  });

  it("job B: scoping holds — the bridge counts only its own job's time", async () => {
    const minutes = await trackedLaborMinutesFromActivityEntries(cc(), ACCOUNT, jobB);
    expect(minutes).toBe(200);
  });

  it("empty job: zero (no false labor)", async () => {
    const minutes = await trackedLaborMinutesFromActivityEntries(cc(), ACCOUNT, jobEmpty);
    expect(minutes).toBe(0);
    expect(trackedLaborCents(minutes)).toBe(0);
  });
});
