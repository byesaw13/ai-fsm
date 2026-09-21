import { describe, expect, it } from "vitest";
import { todayEmptyCopy, todayJobCountLabel, todayJobsHeading } from "../today-list";

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
