import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "pg";
import {
  findDueReminders,
  findEligibleVisits,
  emitVisitReminder,
  markAutomationRun,
  processVisitReminder,
  runVisitReminders,
} from "./visit-reminder.js";
import type { AutomationRow, EligibleVisit } from "./visit-reminder.js";
import { logger } from "./logger.js";

// Mock pg Client
function mockClient(overrides: Record<string, unknown> = {}): Client {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    ...overrides,
  } as unknown as Client;
}

const AUTOMATION: AutomationRow = {
  id: "auto-1",
  account_id: "acct-1",
  type: "visit_reminder",
  config: { hours_before: 24 },
  enabled: true,
  next_run_at: "2026-02-17T00:00:00Z",
};

const VISIT: EligibleVisit = {
  id: "visit-1",
  account_id: "acct-1",
  job_id: "job-1",
  assigned_user_id: "user-1",
  scheduled_start: "2026-02-18T09:00:00Z",
  job_title: "Lawn Mowing",
  client_name: "John Doe",
};

describe("findDueReminders", () => {
  it("queries for due visit_reminder automations", async () => {
    const client = mockClient();
    (client.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [AUTOMATION],
    });

    const result = await findDueReminders(client);

    expect(result).toEqual([AUTOMATION]);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("visit_reminder")
    );
  });

  it("returns empty array when none due", async () => {
    const client = mockClient();
    const result = await findDueReminders(client);
    expect(result).toEqual([]);
  });
});

describe("findEligibleVisits", () => {
  it("queries visits within hours_before window", async () => {
    const client = mockClient();
    (client.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [VISIT],
    });

    const result = await findEligibleVisits(client, AUTOMATION);

    expect(result).toEqual([VISIT]);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("scheduled"),
      [AUTOMATION.account_id, 24]
    );
  });

  it("defaults hours_before to 24 when not in config", async () => {
    const client = mockClient();
    const autoNoConfig: AutomationRow = {
      ...AUTOMATION,
      config: {},
    };

    await findEligibleVisits(client, autoNoConfig);

    expect(client.query).toHaveBeenCalledWith(
      expect.any(String),
      [autoNoConfig.account_id, 24]
    );
  });

  it("uses custom hours_before from config", async () => {
    const client = mockClient();
    const autoCustom: AutomationRow = {
      ...AUTOMATION,
      config: { hours_before: 48 },
    };

    await findEligibleVisits(client, autoCustom);

    expect(client.query).toHaveBeenCalledWith(
      expect.any(String),
      [autoCustom.account_id, 48]
    );
  });

  it("excludes visits that already have reminders (NOT EXISTS clause)", async () => {
    const client = mockClient();
    await findEligibleVisits(client, AUTOMATION);

    const sql = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("visit_reminder");
  });
});

describe("emitVisitReminder", () => {
  it("inserts audit_log entry and returns true for new reminder", async () => {
    const queryFn = vi.fn();
    // First call: check existing (none found)
    queryFn.mockResolvedValueOnce({ rowCount: 0 });
    // Second call: insert
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    const client = { query: queryFn } as unknown as Client;

    const result = await emitVisitReminder(client, VISIT, AUTOMATION.id);

    expect(result).toBe(true);
    expect(queryFn).toHaveBeenCalledTimes(2);
    // Check the insert call
    const insertArgs = queryFn.mock.calls[1];
    expect(insertArgs[0]).toContain("INSERT INTO audit_log");
    expect(insertArgs[1][0]).toBe(VISIT.account_id); // account_id
    expect(insertArgs[1][1]).toBe(VISIT.id); // entity_id = visit id
  });

  it("returns false and skips insert if reminder already exists", async () => {
    const queryFn = vi.fn();
    // First call: check existing (found one)
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    const client = { query: queryFn } as unknown as Client;

    const result = await emitVisitReminder(client, VISIT, AUTOMATION.id);

    expect(result).toBe(false);
    // Should only have called the check query, not the insert
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("stores automation_id and visit details in new_value", async () => {
    const queryFn = vi.fn();
    queryFn.mockResolvedValueOnce({ rowCount: 0 });
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    const client = { query: queryFn } as unknown as Client;

    await emitVisitReminder(client, VISIT, AUTOMATION.id);

    const insertArgs = queryFn.mock.calls[1];
    const newValue = JSON.parse(insertArgs[1][3]);
    expect(newValue.automation_id).toBe(AUTOMATION.id);
    expect(newValue.visit_scheduled_start).toBe(VISIT.scheduled_start);
    expect(newValue.job_id).toBe(VISIT.job_id);
    expect(newValue.job_title).toBe(VISIT.job_title);
    expect(newValue.client_name).toBe(VISIT.client_name);
    expect(newValue.assigned_user_id).toBe(VISIT.assigned_user_id);
    expect(newValue.reminder_sent_at).toBeDefined();
  });
});

describe("markAutomationRun", () => {
  it("updates last_run_at and advances next_run_at", async () => {
    const client = mockClient();

    await markAutomationRun(client, AUTOMATION.id);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("last_run_at = now()"),
      [AUTOMATION.id]
    );
    expect(
      (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0]
    ).toContain("next_run_at = now() + interval '1 hour'");
  });
});

describe("processVisitReminder", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(logger, "error").mockImplementation(() => {});
  });

  it("processes eligible visits and returns counts", async () => {
    const queryFn = vi.fn();
    // findEligibleVisits
    queryFn.mockResolvedValueOnce({ rows: [VISIT, { ...VISIT, id: "visit-2" }] });
    // emitVisitReminder for visit-1: check (not exists)
    queryFn.mockResolvedValueOnce({ rowCount: 0 });
    // emitVisitReminder for visit-1: insert
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    // emitVisitReminder for visit-2: check (already exists)
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    // markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const result = await processVisitReminder(client, AUTOMATION);

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.automationId).toBe(AUTOMATION.id);
  });

  it("continues processing after individual visit errors", async () => {
    const queryFn = vi.fn();
    // findEligibleVisits: 2 visits
    queryFn.mockResolvedValueOnce({
      rows: [VISIT, { ...VISIT, id: "visit-2" }],
    });
    // visit-1: check throws
    queryFn.mockRejectedValueOnce(new Error("connection lost"));
    // visit-2: check (not exists)
    queryFn.mockResolvedValueOnce({ rowCount: 0 });
    // visit-2: insert
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    // markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const result = await processVisitReminder(client, AUTOMATION);

    expect(result.sent).toBe(1);
    expect(result.errors).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("visit-reminder"),
      expect.any(Error),
      expect.objectContaining({ visitId: "visit-1" })
    );
  });

  it("marks automation run even with zero eligible visits", async () => {
    const queryFn = vi.fn();
    // findEligibleVisits: none
    queryFn.mockResolvedValueOnce({ rows: [] });
    // markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const result = await processVisitReminder(client, AUTOMATION);

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    // markAutomationRun was called (second query)
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});

describe("runVisitReminders", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(logger, "error").mockImplementation(() => {});
    vi.spyOn(logger, "info").mockImplementation(() => {});
  });

  it("returns empty array when no automations are due", async () => {
    const client = mockClient();
    const results = await runVisitReminders(client);
    expect(results).toEqual([]);
  });

  it("processes each due automation independently", async () => {
    const auto2: AutomationRow = {
      ...AUTOMATION,
      id: "auto-2",
      account_id: "acct-2",
    };

    const queryFn = vi.fn();
    // findDueReminders: 2 automations
    queryFn.mockResolvedValueOnce({ rows: [AUTOMATION, auto2] });
    // auto-1 findEligibleVisits: none
    queryFn.mockResolvedValueOnce({ rows: [] });
    // auto-1 markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    // auto-2 findEligibleVisits: none
    queryFn.mockResolvedValueOnce({ rows: [] });
    // auto-2 markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const results = await runVisitReminders(client);

    expect(results).toHaveLength(2);
    expect(results[0].automationId).toBe("auto-1");
    expect(results[1].automationId).toBe("auto-2");
  });

  it("continues after a failed automation", async () => {
    const auto2: AutomationRow = {
      ...AUTOMATION,
      id: "auto-2",
      account_id: "acct-2",
    };

    const queryFn = vi.fn();
    // findDueReminders: 2 automations
    queryFn.mockResolvedValueOnce({ rows: [AUTOMATION, auto2] });
    // auto-1 findEligibleVisits: throws
    queryFn.mockRejectedValueOnce(new Error("db error"));
    // auto-2 findEligibleVisits: none
    queryFn.mockResolvedValueOnce({ rows: [] });
    // auto-2 markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const results = await runVisitReminders(client);

    // Only auto-2 succeeded
    expect(results).toHaveLength(1);
    expect(results[0].automationId).toBe("auto-2");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("visit-reminder"),
      expect.any(Error),
      expect.objectContaining({ automationId: "auto-1" })
    );
  });
});
