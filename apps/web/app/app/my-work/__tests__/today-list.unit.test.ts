import { describe, expect, it } from "vitest";
import { compareTodayWork, includeStandaloneLookOnToday, standaloneLookTodaySql, todayEmptyCopy, todayJobCountLabel, todayJobsHeading, todayWorkCountLabel, todayWorkHeading } from "../today-list";

describe("Today list speaks jobs, not work orders", () => {
  it("counts jobs", () => {
    expect(todayJobCountLabel(0)).toBe("0 jobs");
    expect(todayJobCountLabel(1)).toBe("1 job");
    expect(todayJobCountLabel(4)).toBe("4 jobs");
  });

  it("heads the list as Jobs", () => {
    expect(todayJobsHeading()).toBe("Jobs");
  });

  it("empty copy does not mention work orders", () => {
    const empty = todayEmptyCopy();
    expect(empty.title).toBe("No jobs today");
    expect(empty.description.toLowerCase()).not.toContain("work order");
    expect(empty.title.toLowerCase()).not.toContain("work order");
  });
});

describe("Today's Work", () => {
  it("names one list", () => {
    expect(todayWorkHeading()).toBe("Today's Work");
    expect(todayWorkCountLabel(0)).toBe("Nothing scheduled");
    expect(todayWorkCountLabel(1)).toBe("1 thing today");
    expect(todayWorkCountLabel(3)).toBe("3 things today");
  });

  it("keeps an underway look and hides a later appointment", () => {
    const now = new Date("2026-10-02T16:00:00.000Z");
    expect(includeStandaloneLookOnToday({
      status: "in_progress",
      scheduledStart: "2026-10-04T15:00:00.000Z",
      now,
    })).toBe(true);
    expect(includeStandaloneLookOnToday({
      status: "scheduled",
      scheduledStart: "2026-10-02T18:00:00.000Z",
      now,
    })).toBe(true);
    expect(includeStandaloneLookOnToday({
      status: "scheduled",
      scheduledStart: "2026-10-03T15:00:00.000Z",
      now,
    })).toBe(false);
    expect(includeStandaloneLookOnToday({
      status: "completed",
      scheduledStart: "2026-10-02T18:00:00.000Z",
      now,
    })).toBe(false);
    expect(standaloneLookTodaySql("America/New_York")).toContain("AT TIME ZONE 'America/New_York'");
    expect(standaloneLookTodaySql("America/New_York'; drop table visits; --")).toContain(
      "AT TIME ZONE 'America/New_York'",
    );
  });

  it("puts active work before later scheduled work", () => {
    const items = [
      { id: "later", active: false, sortTime: "2026-10-02T15:00:00.000Z" },
      { id: "look", active: false, sortTime: "2026-10-02T13:00:00.000Z" },
      { id: "now", active: true, sortTime: "2026-10-02T18:00:00.000Z" },
      { id: "untimed", active: false, sortTime: null },
    ];
    expect([...items].sort(compareTodayWork).map((item) => item.id)).toEqual([
      "now",
      "look",
      "later",
      "untimed",
    ]);
  });
});
