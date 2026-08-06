import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PoolClient } from "pg";
import { deriveValidTransitions, getCurrentOperationsState } from "../state";

const base = {
  business_day: null,
  clocked_in: false,
  clock: null,
  activity: null,
  vehicle_session: null,
} as const;

describe("deriveValidTransitions", () => {
  it("offers open day, clock in, switch activity, and start mileage when nothing is open", () => {
    expect(deriveValidTransitions(base)).toEqual([
      "open_business_day",
      "clock_in",
      "switch_activity",
      "start_mileage_session",
    ]);
  });

  it("offers close day and reopen paths based on business day status", () => {
    expect(
      deriveValidTransitions({
        ...base,
        business_day: { id: "d1", status: "ACTIVE" },
      }),
    ).toContain("close_business_day");

    expect(
      deriveValidTransitions({
        ...base,
        business_day: { id: "d1", status: "CLOSED" },
      }),
    ).toEqual([
      "reopen_business_day",
      "clock_in",
      "switch_activity",
      "start_mileage_session",
    ]);
  });

  it("offers clock out when clocked in; switch is always available", () => {
    const t = deriveValidTransitions({
      ...base,
      business_day: { id: "d1", status: "ACTIVE" },
      clocked_in: true,
      clock: { id: "c1", clock_in_at: "2026-07-06T08:00:00Z" },
    });
    expect(t).toContain("clock_out");
    expect(t).toContain("switch_activity");
    expect(t).not.toContain("clock_in");
    expect(t).not.toContain("stop_activity");
  });

  it("offers stop_activity when an activity is open (even if clocked out)", () => {
    const t = deriveValidTransitions({
      ...base,
      business_day: { id: "d1", status: "ACTIVE" },
      clocked_in: false,
      activity: {
        id: "a1",
        activity_type: "job_work",
        entity_type: null,
        entity_id: null,
        assignment_kind: null,
        labor_bucket: "billable",
        started_at: "2026-08-05T12:00:00Z",
      },
    });
    expect(t).toContain("switch_activity");
    expect(t).toContain("stop_activity");
    expect(t).toContain("clock_in");
  });

  it("offers close mileage when a vehicle session is open", () => {
    const t = deriveValidTransitions({
      ...base,
      business_day: { id: "d1", status: "ACTIVE" },
      vehicle_session: { id: "v1", vehicle_id: "veh1", started_at: "2026-07-06T08:00:00Z" },
    });
    expect(t).toContain("close_mileage_session");
    expect(t).not.toContain("start_mileage_session");
  });
});

vi.mock("../business-day", () => ({
  businessToday: () => "2026-08-05",
  getBusinessDay: vi.fn(async () => null),
}));

describe("getCurrentOperationsState multi-user scope (TASK-056)", () => {
  const accountId = "acct-1";
  const userA = "user-a";
  const userB = "user-b";
  let query: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("FROM time_clock_sessions")) {
        return { rows: [] };
      }
      if (sql.includes("FROM activity_entries")) {
        // Only return a row when the query scopes to userA
        if (params[1] === userA) {
          return {
            rows: [
              {
                id: "act-a",
                activity_type: "job_work",
                entity_type: null,
                entity_id: null,
                assignment_kind: "office",
                labor_bucket: "overhead",
                started_at: "2026-08-05T12:00:00Z",
              },
            ],
          };
        }
        return { rows: [] };
      }
      if (sql.includes("FROM vehicle_sessions")) {
        if (params[1] === userA) {
          return {
            rows: [{ id: "vs-a", vehicle_id: "veh-1", started_at: "2026-08-05T11:00:00Z" }],
          };
        }
        return { rows: [] };
      }
      return { rows: [] };
    });
  });

  it("scopes open activity and vehicle to the session user (not another tech)", async () => {
    const client = { query } as unknown as PoolClient;

    const forA = await getCurrentOperationsState(client, accountId, userA);
    expect(forA.activity?.id).toBe("act-a");
    expect(forA.vehicle_session?.id).toBe("vs-a");

    const forB = await getCurrentOperationsState(client, accountId, userB);
    expect(forB.activity).toBeNull();
    expect(forB.vehicle_session).toBeNull();

    // SQL must bind user id for activity (user_id) and vehicle (created_by)
    const activityCalls = query.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes("FROM activity_entries"),
    );
    const vehicleCalls = query.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes("FROM vehicle_sessions"),
    );
    expect(activityCalls.some((c: unknown[]) => String(c[0]).includes("user_id"))).toBe(true);
    expect(vehicleCalls.some((c: unknown[]) => String(c[0]).includes("created_by"))).toBe(true);
    expect(activityCalls.every((c: unknown[]) => (c[1] as unknown[])[1] === userA || (c[1] as unknown[])[1] === userB)).toBe(true);
  });
});