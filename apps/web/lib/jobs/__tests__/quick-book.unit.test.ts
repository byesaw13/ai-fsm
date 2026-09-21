import { describe, expect, it } from "vitest";
import {
  nextHalfHourLocal,
  resolveQuickBookAssignee,
  resolveQuickBookHouse,
  QUICK_JOB_SUCCESS_HREF,
  QUICK_JOB_PRICING_MODE,
} from "../quick-book";

describe("resolveQuickBookAssignee", () => {
  const sessionUser = "user-owner";

  it("uses the requested tech when one is provided", () => {
    expect(resolveQuickBookAssignee("user-tech", sessionUser)).toBe("user-tech");
    expect(resolveQuickBookAssignee("user-tech", sessionUser, true)).toBe("user-tech");
  });

  it("defaults to the current user only when assignSelf is set (My Day / FAB)", () => {
    expect(resolveQuickBookAssignee(undefined, sessionUser, true)).toBe(sessionUser);
    expect(resolveQuickBookAssignee("", sessionUser, true)).toBe(sessionUser);
  });

  it("keeps Schedule Unassigned as unassigned", () => {
    expect(resolveQuickBookAssignee(undefined, sessionUser)).toBeNull();
    expect(resolveQuickBookAssignee("", sessionUser, false)).toBeNull();
  });
});

describe("nextHalfHourLocal", () => {
  it("rounds 10:07 up to 10:30 on the same date", () => {
    const { date, time } = nextHalfHourLocal(new Date("2026-09-06T10:07:00"));
    expect(date).toBe("2026-09-06");
    expect(time).toBe("10:30");
  });

  it("rolls to the next hour on the half-hour", () => {
    const { date, time } = nextHalfHourLocal(new Date("2026-09-06T10:30:00"));
    expect(date).toBe("2026-09-06");
    expect(time).toBe("11:00");
  });

  it("rolls past midnight to the next date", () => {
    const { date, time } = nextHalfHourLocal(new Date("2026-09-06T23:45:00"));
    expect(date).toBe("2026-09-07");
    expect(time).toBe("00:00");
  });
});

describe("QUICK_JOB_SUCCESS_HREF", () => {
  it("returns the field home so capture does not dump onto the job page", () => {
    expect(QUICK_JOB_SUCCESS_HREF).toBe("/app/my-work");
  });
});

describe("QUICK_JOB_PRICING_MODE", () => {
  it("stores driveway work as T&M, not a silent bid", () => {
    expect(QUICK_JOB_PRICING_MODE).toBe("hourly_internal");
  });
});

describe("resolveQuickBookHouse", () => {
  it("uses an existing property id", () => {
    expect(resolveQuickBookHouse({ property_id: "aaaaaaaa-0000-0000-0000-000000000099" })).toEqual({
      kind: "existing",
      propertyId: "aaaaaaaa-0000-0000-0000-000000000099",
    });
  });

  it("creates a house from a typed address", () => {
    expect(resolveQuickBookHouse({ address: "  4 Ash St  " })).toEqual({
      kind: "create",
      address: "4 Ash St",
    });
  });

  it("prefers an existing property over a typed address", () => {
    expect(
      resolveQuickBookHouse({
        property_id: "aaaaaaaa-0000-0000-0000-000000000099",
        address: "4 Ash St",
      }),
    ).toEqual({
      kind: "existing",
      propertyId: "aaaaaaaa-0000-0000-0000-000000000099",
    });
  });

  it("rejects capture with no house — GPS and history need a pin", () => {
    expect(resolveQuickBookHouse({})).toBeNull();
    expect(resolveQuickBookHouse({ address: "   " })).toBeNull();
  });
});
