import { describe, expect, it } from "vitest";
import { todayNowKind, todayShowsActivityNow, todayShowsFieldRightNow } from "../today-now";

describe("Today has one Now", () => {
  it("does not put activity chips on Today", () => {
    expect(todayShowsActivityNow()).toBe(false);
  });

  it("does not render a second Right now card next to Start this job", () => {
    expect(todayShowsFieldRightNow("job")).toBe(false);
    expect(todayShowsFieldRightNow("park")).toBe(false);
    expect(todayShowsFieldRightNow("start_day")).toBe(false);
    expect(todayShowsFieldRightNow("van")).toBe(false);
  });

  it("Start day is Now before the van is rolling", () => {
    expect(
      todayNowKind({ dayStarted: false, hasParkProposal: false, hasHero: true }),
    ).toBe("start_day");
  });

  it("park confirm is Now, not a stacked hero", () => {
    expect(
      todayNowKind({ dayStarted: true, hasParkProposal: true, hasHero: true }),
    ).toBe("park");
  });

  it("the house card is Now when a job is up", () => {
    expect(
      todayNowKind({ dayStarted: true, hasParkProposal: false, hasHero: true }),
    ).toBe("job");
  });

  it("the van pill is Now when nothing is parked or on a job", () => {
    expect(
      todayNowKind({ dayStarted: true, hasParkProposal: false, hasHero: false }),
    ).toBe("van");
  });
});
