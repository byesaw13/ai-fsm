/**
 * Integration test: closing an activity timer whose started_at is at/after
 * "now" must NOT violate the strict activity_entries_check (ended_at > started_at).
 *
 * Regression for the field "Leaving site — stop timer" 500 ("Failed to end site
 * timer"): the six timer-close paths all run `SET ended_at = now()`, which used
 * to raise a check violation whenever started_at was in the future (clock skew,
 * GPS/auto/backfilled entry, edited timestamp). Migration 167 adds a
 * BEFORE INSERT OR UPDATE trigger that reconciles the boundary by pulling the
 * bogus started_at back to (ended_at - 1min) — the close time is NOT advanced,
 * so the entry never becomes future-dated (which would corrupt billable time
 * and overlap the replacement activities/switch inserts at now()).
 *
 * Tier: DB-level (Tier 2). Only needs TEST_DATABASE_URL — no running server.
 *
 *   TEST_DATABASE_URL=postgresql://... pnpm test
 */
import { describe, it, expect } from "vitest";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL;

// Seed account/owner (002_seed_dev.sql, owner@test.com).
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";
const SEED_OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("activity_entries close clamp (migration 167)", () => {
  it("closing a future-started timer reconciles started_at instead of 500ing", async () => {
    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `SELECT set_config('app.current_account_id',$1,false),
                set_config('app.current_user_id',$2,false),
                set_config('app.current_role','owner',false)`,
        [SEED_ACCOUNT, SEED_OWNER],
      );
      await client.query("BEGIN");

      // Open timer starting 5 minutes in the future — the crash scenario.
      const { rows: ins } = await client.query<{ id: string }>(
        `INSERT INTO activity_entries
           (account_id, user_id, session_date, activity_type, category, source, started_at)
         VALUES ($1, $2, current_date, 'job_work', 'revenue', 'manual', now() + interval '5 minutes')
         RETURNING id`,
        [SEED_ACCOUNT, SEED_OWNER],
      );
      const id = ins[0].id;

      // Close it exactly like end-site-timer/route.ts does. Pre-167 this threw.
      await expect(
        client.query(`UPDATE activity_entries SET ended_at = now() WHERE id = $1`, [id]),
      ).resolves.toBeDefined();

      const { rows } = await client.query<{
        ok: boolean;
        reconciled: boolean;
        close_not_future: boolean;
      }>(
        `SELECT ended_at > started_at                               AS ok,
                started_at = ended_at - interval '1 minute'         AS reconciled,
                ended_at <= now()                                   AS close_not_future
         FROM activity_entries WHERE id = $1`,
        [id],
      );
      // Check satisfied, boundary reconciled by pulling started_at back, and the
      // close was NOT advanced into the future.
      expect(rows[0].ok).toBe(true);
      expect(rows[0].reconciled).toBe(true);
      expect(rows[0].close_not_future).toBe(true);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
  });
});
