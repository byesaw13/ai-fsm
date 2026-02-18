/**
 * Integration tests for the Visit Reminder worker.
 *
 * These tests run against a real PostgreSQL instance with migrations + seed applied.
 * Set TEST_DATABASE_URL to enable. Skipped locally when not set.
 *
 * In CI, the test job provisions a Postgres service container and sets
 * TEST_DATABASE_URL automatically — these tests WILL run in CI.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Client } from "pg";
import {
  findDueReminders,
  findEligibleVisits,
  emitVisitReminder,
  processVisitReminder,
  runVisitReminders,
} from "./visit-reminder.js";
import type { AutomationRow, EligibleVisit } from "./visit-reminder.js";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const shouldRun = !!TEST_DB_URL;

// Deterministic UUIDs from seed data
const ACCOUNT_A = "11111111-1111-1111-1111-111111111111";
const OWNER_A = "11111111-1111-1111-1111-aaaaaaaaaaaa";
const TECH_A = "11111111-1111-1111-1111-cccccccccccc";

describe.skipIf(!shouldRun)("Visit Reminder Integration Tests", () => {
  let client: Client;

  // Test data IDs — created in beforeAll, cleaned up in afterAll
  let testClientId: string;
  let testJobId: string;
  let testVisitId: string;
  let testAutomationId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();

    // Create test client
    const clientRes = await client.query<{ id: string }>(
      `INSERT INTO clients (account_id, name, email)
       VALUES ($1, 'Reminder Test Client', 'reminder-test@example.com')
       RETURNING id`,
      [ACCOUNT_A]
    );
    testClientId = clientRes.rows[0].id;

    // Create test job
    const jobRes = await client.query<{ id: string }>(
      `INSERT INTO jobs (account_id, client_id, title, status, created_by)
       VALUES ($1, $2, 'Reminder Test Job', 'scheduled', $3)
       RETURNING id`,
      [ACCOUNT_A, testClientId, OWNER_A]
    );
    testJobId = jobRes.rows[0].id;

    // Create a visit scheduled 12 hours from now (within 24h reminder window)
    const visitRes = await client.query<{ id: string }>(
      `INSERT INTO visits (account_id, job_id, assigned_user_id, status, scheduled_start, scheduled_end)
       VALUES ($1, $2, $3, 'scheduled', now() + interval '12 hours', now() + interval '13 hours')
       RETURNING id`,
      [ACCOUNT_A, testJobId, TECH_A]
    );
    testVisitId = visitRes.rows[0].id;

    // Create a visit_reminder automation for Account A, due now
    const autoRes = await client.query<{ id: string }>(
      `INSERT INTO automations (account_id, type, enabled, config, next_run_at)
       VALUES ($1, 'visit_reminder', true, '{"hours_before": 24}', now() - interval '1 minute')
       RETURNING id`,
      [ACCOUNT_A]
    );
    testAutomationId = autoRes.rows[0].id;
  });

  afterEach(async () => {
    // Clean up any reminder audit entries created by tests
    await client.query(
      `DELETE FROM audit_log WHERE entity_type = 'visit_reminder' AND account_id = $1`,
      [ACCOUNT_A]
    );
  });

  afterAll(async () => {
    // Clean up test data in reverse dependency order
    if (testAutomationId) {
      await client.query(`DELETE FROM automations WHERE id = $1`, [testAutomationId]);
    }
    if (testVisitId) {
      await client.query(`DELETE FROM visits WHERE id = $1`, [testVisitId]);
    }
    if (testJobId) {
      await client.query(`DELETE FROM jobs WHERE id = $1`, [testJobId]);
    }
    if (testClientId) {
      await client.query(`DELETE FROM clients WHERE id = $1`, [testClientId]);
    }
    await client.end();
  });

  it("findDueReminders returns due automations", async () => {
    const automations = await findDueReminders(client);
    expect(automations.length).toBeGreaterThanOrEqual(1);

    const found = automations.find((a) => a.id === testAutomationId);
    expect(found).toBeDefined();
    expect(found!.type).toBe("visit_reminder");
    expect(found!.account_id).toBe(ACCOUNT_A);
  });

  it("findEligibleVisits returns visits within the reminder window", async () => {
    const automation: AutomationRow = {
      id: testAutomationId,
      account_id: ACCOUNT_A,
      type: "visit_reminder",
      config: { hours_before: 24 },
      enabled: true,
      next_run_at: new Date().toISOString(),
    };

    const visits = await findEligibleVisits(client, automation);
    expect(visits.length).toBeGreaterThanOrEqual(1);

    const found = visits.find((v) => v.id === testVisitId);
    expect(found).toBeDefined();
    expect(found!.job_id).toBe(testJobId);
    expect(found!.assigned_user_id).toBe(TECH_A);
  });

  it("findEligibleVisits excludes visits outside the window", async () => {
    const automation: AutomationRow = {
      id: testAutomationId,
      account_id: ACCOUNT_A,
      type: "visit_reminder",
      config: { hours_before: 1 }, // Only 1 hour window — our visit is 12h away
      enabled: true,
      next_run_at: new Date().toISOString(),
    };

    const visits = await findEligibleVisits(client, automation);
    const found = visits.find((v) => v.id === testVisitId);
    expect(found).toBeUndefined(); // 12h away, outside 1h window
  });

  it("emitVisitReminder creates audit_log entry", async () => {
    const visit: EligibleVisit = {
      id: testVisitId,
      account_id: ACCOUNT_A,
      job_id: testJobId,
      assigned_user_id: TECH_A,
      scheduled_start: new Date(Date.now() + 12 * 3600000).toISOString(),
      job_title: "Reminder Test Job",
      client_name: "Reminder Test Client",
    };

    const emitted = await emitVisitReminder(client, visit, testAutomationId);
    expect(emitted).toBe(true);

    // Verify audit_log entry
    const { rows } = await client.query(
      `SELECT entity_type, entity_id, action, actor_id, new_value
       FROM audit_log
       WHERE entity_type = 'visit_reminder' AND entity_id = $1`,
      [testVisitId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("insert");
    expect(rows[0].actor_id).toBe(testAutomationId);

    const newValue = rows[0].new_value;
    expect(newValue.automation_id).toBe(testAutomationId);
    expect(newValue.job_id).toBe(testJobId);
  });

  it("emitVisitReminder is idempotent — skips duplicate", async () => {
    const visit: EligibleVisit = {
      id: testVisitId,
      account_id: ACCOUNT_A,
      job_id: testJobId,
      assigned_user_id: TECH_A,
      scheduled_start: new Date(Date.now() + 12 * 3600000).toISOString(),
      job_title: "Reminder Test Job",
      client_name: "Reminder Test Client",
    };

    // First call: should emit
    const first = await emitVisitReminder(client, visit, testAutomationId);
    expect(first).toBe(true);

    // Second call: should skip (idempotent)
    const second = await emitVisitReminder(client, visit, testAutomationId);
    expect(second).toBe(false);

    // Only one audit entry should exist
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM audit_log
       WHERE entity_type = 'visit_reminder' AND entity_id = $1`,
      [testVisitId]
    );
    expect(rows[0].count).toBe(1);
  });

  it("processVisitReminder processes visits and updates automation timestamps", async () => {
    const automation: AutomationRow = {
      id: testAutomationId,
      account_id: ACCOUNT_A,
      type: "visit_reminder",
      config: { hours_before: 24 },
      enabled: true,
      next_run_at: new Date().toISOString(),
    };

    const result = await processVisitReminder(client, automation);

    expect(result.automationId).toBe(testAutomationId);
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);

    // Verify automation timestamps were updated
    const { rows } = await client.query(
      `SELECT last_run_at, next_run_at FROM automations WHERE id = $1`,
      [testAutomationId]
    );
    expect(rows[0].last_run_at).not.toBeNull();
    expect(new Date(rows[0].next_run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("runVisitReminders processes all due automations end-to-end", async () => {
    // Reset the automation to be due again
    await client.query(
      `UPDATE automations SET next_run_at = now() - interval '1 minute', last_run_at = NULL WHERE id = $1`,
      [testAutomationId]
    );

    const results = await runVisitReminders(client);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const myResult = results.find((r) => r.automationId === testAutomationId);
    expect(myResult).toBeDefined();
    // Visits may have been reminded already in prior tests, so they'll be skipped
    expect(myResult!.errors).toBe(0);
  });

  it("repeated runVisitReminders does not emit duplicate reminders", async () => {
    // Reset automation
    await client.query(
      `UPDATE automations SET next_run_at = now() - interval '1 minute' WHERE id = $1`,
      [testAutomationId]
    );

    // First run
    await runVisitReminders(client);

    // Reset automation again
    await client.query(
      `UPDATE automations SET next_run_at = now() - interval '1 minute' WHERE id = $1`,
      [testAutomationId]
    );

    // Second run — should not create duplicates
    const results = await runVisitReminders(client);
    const myResult = results.find((r) => r.automationId === testAutomationId);

    // All visits should be skipped (already reminded) or 0 eligible
    if (myResult) {
      expect(myResult.sent).toBe(0);
    }

    // Count total reminder entries for our visit — should be exactly 1
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM audit_log
       WHERE entity_type = 'visit_reminder' AND entity_id = $1`,
      [testVisitId]
    );
    expect(rows[0].count).toBe(1);
  });
});

// Placeholder to prevent vitest from complaining about empty test file when skipped
describe("Visit Reminder Integration (skipped)", () => {
  it.skipIf(shouldRun)("skipped: requires TEST_DATABASE_URL", () => {
    expect(true).toBe(true);
  });
});
