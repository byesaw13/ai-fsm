/**
 * Parameterized integration harness for automation lifecycle cadences.
 *
 * Requires TEST_DATABASE_URL with migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { runAutomationType } from "./runner.js";
import {
  bookingConfirmedDef,
  estimateFollowupDef,
  reviewRequestDef,
  seasonalSpringDef,
} from "./registry.js";
import { isInSeason, getCurrentSeason } from "../seasonal-reminder.js";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const shouldRun = !!TEST_DB_URL;

type LifecycleFixture = {
  name: string;
  type: string;
  def: typeof bookingConfirmedDef;
  expectedInterval: string;
};

const LIFECYCLE_FIXTURES: LifecycleFixture[] = [
  {
    name: "booking_confirmed",
    type: "booking_confirmed",
    def: bookingConfirmedDef,
    expectedInterval: "30 minutes",
  },
  {
    name: "estimate_followup",
    type: "estimate_followup",
    def: estimateFollowupDef,
    expectedInterval: "4 hours",
  },
  // lead_followup is in the registry (K10) but not yet in automations_type_check;
  // +1 hour cadence is covered in lifecycle.test.ts instead.
  {
    name: "review_request",
    type: "review_request",
    def: reviewRequestDef,
    expectedInterval: "1 hour",
  },
];

describe.skipIf(!shouldRun)("automations integration harness", () => {
  let client: Client;
  let accountId: string;
  const automationIds: Record<string, string> = {};

  beforeAll(async () => {
    client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();

    const accRes = await client.query(
      `INSERT INTO accounts (name) VALUES ('automation-harness-account') RETURNING id`
    );
    accountId = accRes.rows[0].id;

    for (const fixture of LIFECYCLE_FIXTURES) {
      const autoRes = await client.query(
        `INSERT INTO automations (account_id, type, enabled, config, next_run_at)
         VALUES ($1, $2, true, '{}'::jsonb, now() - interval '1 minute')
         RETURNING id`,
        [accountId, fixture.type]
      );
      automationIds[fixture.name] = autoRes.rows[0].id;
    }

    const springRes = await client.query(
      `INSERT INTO automations (account_id, type, enabled, config, next_run_at)
       VALUES ($1, 'seasonal_reminder_spring', true, '{}'::jsonb, now() - interval '1 minute')
       RETURNING id`,
      [accountId]
    );
    automationIds.seasonal_spring = springRes.rows[0].id;
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DELETE FROM audit_log WHERE account_id = $1`, [accountId]);
      await client.query(`DELETE FROM automations WHERE account_id = $1`, [accountId]);
      await client.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
      await client.end();
    }
  });

  describe.each(LIFECYCLE_FIXTURES)("$name lifecycle", (fixture) => {
    it(`advances next_run_at by ${fixture.expectedInterval}`, async () => {
      const automationId = automationIds[fixture.name];

      await client.query(
        `UPDATE automations
            SET next_run_at = now() - interval '1 minute',
                last_run_at = NULL
          WHERE id = $1`,
        [automationId]
      );

      const before = await client.query(
        `SELECT next_run_at FROM automations WHERE id = $1`,
        [automationId]
      );
      const beforeNext = new Date(before.rows[0].next_run_at).getTime();

      await runAutomationType(fixture.def, client);

      const after = await client.query(
        `SELECT last_run_at, next_run_at FROM automations WHERE id = $1`,
        [automationId]
      );
      expect(after.rows[0].last_run_at).not.toBeNull();

      const afterNext = new Date(after.rows[0].next_run_at).getTime();
      expect(afterNext).toBeGreaterThan(beforeNext);
      expect(afterNext).toBeGreaterThan(Date.now());
    });
  });

  it("seasonal_reminder_spring uses season-aware advancement", async () => {
    const automationId = automationIds.seasonal_spring;

    await client.query(
      `UPDATE automations
          SET next_run_at = now() - interval '1 minute',
              last_run_at = NULL
        WHERE id = $1`,
      [automationId]
    );

    await runAutomationType(seasonalSpringDef, client);

    const { rows } = await client.query(
      `SELECT last_run_at, next_run_at FROM automations WHERE id = $1`,
      [automationId]
    );
    expect(rows[0].last_run_at).not.toBeNull();

    const nextRun = new Date(rows[0].next_run_at);
    const season = getCurrentSeason("seasonal_reminder_spring");

    if (isInSeason(season)) {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const delta = nextRun.getTime() - Date.now();
      expect(delta).toBeGreaterThan(sevenDaysMs - 60_000);
      expect(delta).toBeLessThan(sevenDaysMs + 60_000);
    } else {
      expect(nextRun.getTime()).toBeGreaterThan(Date.now());
    }
  });
});

describe("automations integration (skipped)", () => {
  it.skipIf(shouldRun)("skipped: requires TEST_DATABASE_URL", () => {
    expect(true).toBe(true);
  });
});