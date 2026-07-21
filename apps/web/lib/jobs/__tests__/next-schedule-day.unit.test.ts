import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  buildAddDayHref,
  buildNextScheduleDayPrefill,
  businessDateOf,
  businessTimeOf,
  nextDayAfterVisit,
} from "../next-schedule-day";

const TZ = "America/New_York";

describe("businessDateOf / businessTimeOf", () => {
  it("reads Eastern calendar date from a UTC instant", () => {
    // 2026-07-15 14:00 UTC = 10:00 AM Eastern
    expect(businessDateOf("2026-07-15T14:00:00.000Z", TZ)).toBe("2026-07-15");
    expect(businessTimeOf("2026-07-15T14:00:00.000Z", TZ)).toBe("10:00");
  });

  it("handles late evening Eastern still same calendar day", () => {
    // 2026-07-16 01:30 UTC = July 15 9:30 PM Eastern
    expect(businessDateOf("2026-07-16T01:30:00.000Z", TZ)).toBe("2026-07-15");
    expect(businessTimeOf("2026-07-16T01:30:00.000Z", TZ)).toBe("21:30");
  });
});

describe("addCalendarDays", () => {
  it("rolls across month boundaries", () => {
    expect(addCalendarDays("2026-07-31", 1)).toBe("2026-08-01");
  });
});

describe("nextDayAfterVisit", () => {
  it("returns the calendar day after the prior visit", () => {
    expect(nextDayAfterVisit("2026-07-15T12:00:00.000Z", "2026-07-10", TZ)).toBe(
      "2026-07-16",
    );
  });

  it("floors to today when the next day would be in the past", () => {
    expect(nextDayAfterVisit("2026-07-01T12:00:00.000Z", "2026-07-20", TZ)).toBe(
      "2026-07-20",
    );
  });
});

describe("buildNextScheduleDayPrefill", () => {
  it("returns null when there are no usable visits", () => {
    expect(
      buildNextScheduleDayPrefill([
        {
          scheduled_start: "2026-07-15T12:00:00.000Z",
          scheduled_end: "2026-07-15T20:00:00.000Z",
          visit_type: "site_visit",
          status: "completed",
        },
      ]),
    ).toBeNull();
  });

  it("prefills from the latest standard visit", () => {
    const prefill = buildNextScheduleDayPrefill(
      [
        {
          scheduled_start: "2026-07-14T12:00:00.000Z",
          scheduled_end: "2026-07-14T20:00:00.000Z",
          visit_type: "standard",
          status: "completed",
          assigned_user_id: "user-old",
          work_order_id: "wo-old",
        },
        {
          // 08:00–16:00 Eastern on July 15
          scheduled_start: "2026-07-15T12:00:00.000Z",
          scheduled_end: "2026-07-15T20:00:00.000Z",
          visit_type: "standard",
          status: "completed",
          assigned_user_id: "user-1",
          work_order_id: "wo-1",
        },
      ],
      { today: "2026-07-10", tz: TZ },
    );

    expect(prefill).toEqual({
      date: "2026-07-16",
      startTime: "08:00",
      durationMinutes: 480,
      assignedUserId: "user-1",
      workOrderId: "wo-1",
    });
  });

  it("ignores cancelled visits", () => {
    const prefill = buildNextScheduleDayPrefill(
      [
        {
          scheduled_start: "2026-07-18T12:00:00.000Z",
          scheduled_end: "2026-07-18T20:00:00.000Z",
          visit_type: "standard",
          status: "cancelled",
          work_order_id: "wo-x",
        },
        {
          scheduled_start: "2026-07-15T12:00:00.000Z",
          scheduled_end: "2026-07-15T16:00:00.000Z",
          visit_type: "standard",
          status: "completed",
          work_order_id: "wo-1",
        },
      ],
      { today: "2026-07-10", tz: TZ },
    );

    expect(prefill?.date).toBe("2026-07-16");
    expect(prefill?.durationMinutes).toBe(240);
    expect(prefill?.workOrderId).toBe("wo-1");
  });
});

describe("buildAddDayHref", () => {
  it("includes book_work intent even without prior visits", () => {
    const href = buildAddDayHref("job-1", []);
    expect(href).toContain("/app/jobs/job-1/visits/new?");
    expect(href).toContain("visit_type=standard");
    expect(href).toContain("intent=book_work");
    expect(href).not.toContain("date=");
  });

  it("appends prefill params from prior visit", () => {
    const href = buildAddDayHref(
      "job-1",
      [
        {
          scheduled_start: "2026-07-15T12:00:00.000Z",
          scheduled_end: "2026-07-15T20:00:00.000Z",
          visit_type: "standard",
          status: "completed",
          assigned_user_id: "user-1",
          work_order_id: "wo-1",
        },
      ],
      { today: "2026-07-10", tz: TZ },
    );
    expect(href).toContain("date=2026-07-16");
    expect(href).toContain("start=08%3A00");
    expect(href).toContain("duration=480");
    expect(href).toContain("work_order_id=wo-1");
    expect(href).toContain("assigned_user_id=user-1");
  });
});
