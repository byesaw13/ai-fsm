import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "pg";
import {
  advanceVisitReminderNextRun,
  advanceInvoiceFollowupNextRun,
  advanceLeadFollowupNextRun,
  advanceReviewRequestNextRun,
  advanceBookingConfirmedNextRun,
  advanceEstimateFollowupNextRun,
  advanceStaleJobNudgeNextRun,
  advancePropertyIssueScanNextRun,
  advanceClientReactivationNextRun,
  advanceRecurringInspectionNextRun,
  advanceSeasonalNextRun,
} from "./lifecycle.js";
import type { AutomationRow, RunResult } from "./types.js";
import * as seasonal from "../seasonal-reminder.js";

function mockClient(): Client {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
  } as unknown as Client;
}

const AUTOMATION: AutomationRow = {
  id: "auto-1",
  account_id: "acct-1",
  type: "visit_reminder",
  config: {},
  enabled: true,
  next_run_at: "2026-02-17T00:00:00Z",
};

const RESULT: RunResult = {
  automationId: AUTOMATION.id,
  accountId: AUTOMATION.account_id,
  sent: 0,
  skipped: 0,
  errors: 0,
};

type LifecycleCase = {
  name: string;
  advance: (client: Client, automation: AutomationRow, result: RunResult) => Promise<void>;
  type: string;
  interval: string;
};

const LIFECYCLE_CASES: LifecycleCase[] = [
  {
    name: "visit_reminder",
    advance: advanceVisitReminderNextRun,
    type: "visit_reminder",
    interval: "1 hour",
  },
  {
    name: "invoice_followup",
    advance: advanceInvoiceFollowupNextRun,
    type: "invoice_followup",
    interval: "1 hour",
  },
  {
    name: "lead_followup",
    advance: advanceLeadFollowupNextRun,
    type: "lead_followup",
    interval: "1 hour",
  },
  {
    name: "review_request",
    advance: advanceReviewRequestNextRun,
    type: "review_request",
    interval: "1 hour",
  },
  {
    name: "booking_confirmed",
    advance: advanceBookingConfirmedNextRun,
    type: "booking_confirmed",
    interval: "30 minutes",
  },
  {
    name: "estimate_followup",
    advance: advanceEstimateFollowupNextRun,
    type: "estimate_followup",
    interval: "4 hours",
  },
  {
    name: "stale_job_nudge",
    advance: advanceStaleJobNudgeNextRun,
    type: "stale_job_nudge",
    interval: "6 hours",
  },
  {
    name: "property_issue_scan",
    advance: advancePropertyIssueScanNextRun,
    type: "property_issue_scan",
    interval: "24 hours",
  },
  {
    name: "client_reactivation",
    advance: advanceClientReactivationNextRun,
    type: "client_reactivation",
    interval: "24 hours",
  },
  {
    name: "recurring_inspection",
    advance: advanceRecurringInspectionNextRun,
    type: "recurring_inspection",
    interval: "24 hours",
  },
];

describe.each(LIFECYCLE_CASES)("advanceNextRun ($name)", ({ advance, type, interval }) => {
  it(`advances next_run_at by ${interval}`, async () => {
    const client = mockClient();
    const automation = { ...AUTOMATION, type };

    await advance(client, automation, RESULT);

    expect(client.query).toHaveBeenCalledOnce();
    const [sql, params] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("last_run_at = now()");
    expect(sql).toContain(`interval '${interval}'`);
    expect(params).toEqual([automation.id]);
  });
});

describe("advanceSeasonalNextRun", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("advances by 7 days when in season", async () => {
    vi.spyOn(seasonal, "isInSeason").mockReturnValue(true);
    const client = mockClient();
    const automation = { ...AUTOMATION, type: "seasonal_reminder_spring" };

    await advanceSeasonalNextRun(client, automation, RESULT);

    const [sql, params] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("interval '7 days'");
    expect(params).toEqual([automation.id]);
  });

  it("advances to next season start when out of season", async () => {
    vi.spyOn(seasonal, "isInSeason").mockReturnValue(false);
    const nextStart = new Date("2026-09-01T00:00:00.000Z");
    vi.spyOn(seasonal, "nextSeasonStartDate").mockReturnValue(nextStart);
    const client = mockClient();
    const automation = { ...AUTOMATION, type: "seasonal_reminder_fall" };

    await advanceSeasonalNextRun(client, automation, RESULT);

    const [sql, params] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("next_run_at = $1");
    expect(params).toEqual([nextStart.toISOString(), automation.id]);
  });
});