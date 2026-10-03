import { describe, expect, it } from "vitest";
import {
  businessMonthKey,
  sqlSafeTimeZone,
  timestampBusinessMonthExpr,
} from "../business-month";

describe("business month", () => {
  it("keeps 11:30 PM Eastern on the last day inside that month", () => {
    // 2026-03-31 23:30 EDT is 2026-04-01 03:30 UTC.
    expect(businessMonthKey(new Date("2026-04-01T03:30:00.000Z"), "America/New_York")).toBe("2026-03");
  });

  it("moves to the next month after midnight Eastern", () => {
    expect(businessMonthKey(new Date("2026-04-01T04:30:00.000Z"), "America/New_York")).toBe("2026-04");
  });

  it("rejects a timezone that is not safe to interpolate", () => {
    expect(sqlSafeTimeZone("America/New_York'; drop table invoices; --")).toBe("America/New_York");
    expect(sqlSafeTimeZone(null)).toBe("America/New_York");
  });

  it("converts timestamptz columns in the business zone", () => {
    expect(timestampBusinessMonthExpr("created_at", "America/New_York")).toBe(
      "to_char(created_at AT TIME ZONE 'America/New_York', 'YYYY-MM')",
    );
    expect(timestampBusinessMonthExpr("inv.created_at", "America/Chicago")).toBe(
      "to_char(inv.created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM')",
    );
  });
});
