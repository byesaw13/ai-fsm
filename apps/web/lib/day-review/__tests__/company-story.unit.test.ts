import { describe, expect, it } from "vitest";
import {
  assembleCompanyDayStoryInput,
  companyDayStory,
  shortHouseLabel,
  type CompanyDayStoryInput,
} from "../company-story";

const TUESDAY: CompanyDayStoryInput = {
  houseCount: 3,
  jobMinutes: 340,
  miles: 48,
  billsSent: 2,
  billsOnHold: [{ houseLabel: "4 Ash St", clientName: "Peter Marinelli" }],
  comingBack: [
    {
      when: "2026-09-24T12:00:00-04:00",
      houseLabel: "4 Ash St, Salem, NH",
      startHere: "closet doors still in the truck",
    },
  ],
  leftoverReceipts: [{ vendor: "Home Depot", amountCents: 8700 }],
  unansweredStops: 0,
  clocksDisagree: false,
};

describe("shortHouseLabel", () => {
  it("keeps number and first street word", () => {
    expect(shortHouseLabel("4 Ash St, Salem, NH")).toBe("4 Ash");
    expect(shortHouseLabel("68 Claremont Ave")).toBe("68 Claremont");
  });

  it("falls back to the street when there is no number", () => {
    expect(shortHouseLabel("The Marinelli place")).toBe("The Marinelli place");
  });
});

describe("companyDayStory", () => {
  it("tells Tuesday in shop English — houses, hours, miles, bills, coming back, leftovers", () => {
    const story = companyDayStory(TUESDAY);
    expect(story.housesLine).toBe("3 houses. 5h 40m on jobs. 48 miles.");
    expect(story.billsLine).toBe("Bills: 2 sent, 1 on Hold (Peter — tap to send).");
    expect(story.comingBackLine).toBe(
      "Coming back: Thu · 4 Ash · closet doors still in the truck.",
    );
    expect(story.leftoversLine).toBe("Leftovers: Home Depot $87 — which house?");
    expect(story.isQuietNight).toBe(false);
  });

  it("uses No houses and 0m when the day is empty", () => {
    const story = companyDayStory({
      houseCount: 0,
      jobMinutes: 0,
      miles: null,
      billsSent: 0,
      billsOnHold: [],
      comingBack: [],
      leftoverReceipts: [],
      unansweredStops: 0,
      clocksDisagree: false,
    });
    expect(story.housesLine).toBe("No houses. 0m on jobs.");
    expect(story.billsLine).toBe("Bills: none.");
    expect(story.comingBackLine).toBe("Coming back: none.");
    expect(story.leftoversLine).toBe("Leftovers: none.");
    expect(story.isQuietNight).toBe(true);
  });

  it("singularizes one house and one hour", () => {
    const story = companyDayStory({
      ...TUESDAY,
      houseCount: 1,
      jobMinutes: 60,
      miles: 8,
      leftoverReceipts: [],
    });
    expect(story.housesLine).toBe("1 house. 1h on jobs. 8 miles.");
  });

  it("names the house on Hold when there is no person name", () => {
    const story = companyDayStory({
      ...TUESDAY,
      billsSent: 0,
      billsOnHold: [{ houseLabel: "12 Elm St", clientName: null }],
      leftoverReceipts: [],
    });
    expect(story.billsLine).toBe("Bills: 1 on Hold (12 Elm — tap to send).");
  });

  it("does not name a house when more than one bill is on Hold", () => {
    const story = companyDayStory({
      ...TUESDAY,
      billsOnHold: [
        { houseLabel: "4 Ash St", clientName: "Peter" },
        { houseLabel: "12 Elm St", clientName: "Jo" },
      ],
      leftoverReceipts: [],
    });
    expect(story.billsLine).toBe("Bills: 2 sent, 2 on Hold.");
  });

  it("drops start-here and the date when they are missing", () => {
    const story = companyDayStory({
      ...TUESDAY,
      leftoverReceipts: [],
      comingBack: [{ when: null, houseLabel: "12 Elm St", startHere: null }],
    });
    expect(story.comingBackLine).toBe("Coming back: 12 Elm.");
  });

  it("lists two coming-back houses on one line", () => {
    const story = companyDayStory({
      ...TUESDAY,
      leftoverReceipts: [],
      comingBack: [
        {
          when: "2026-09-24T12:00:00-04:00",
          houseLabel: "4 Ash St",
          startHere: "closet doors still in the truck",
        },
        { when: "2026-09-25T12:00:00-04:00", houseLabel: "12 Elm St", startHere: null },
      ],
    });
    expect(story.comingBackLine).toBe(
      "Coming back: Thu · 4 Ash · closet doors still in the truck. Fri · 12 Elm.",
    );
  });

  it("uses unanswered stops as the leftover when there is no receipt", () => {
    const story = companyDayStory({
      ...TUESDAY,
      leftoverReceipts: [],
      unansweredStops: 2,
    });
    expect(story.leftoversLine).toBe("Leftovers: 2 stops still need a reason.");
  });

  it("uses one leftover line when the van and the clock disagree — not a map", () => {
    const story = companyDayStory({
      ...TUESDAY,
      leftoverReceipts: [],
      unansweredStops: 0,
      clocksDisagree: true,
    });
    expect(story.leftoversLine).toBe("Leftovers: The van and the clock don't match.");
    expect(story.leftoversLine).not.toMatch(/gps|map|odometer|segment|delta/i);
  });

  it("collapses receipts, stops, and a clock mismatch into one leftover line", () => {
    const story = companyDayStory({
      ...TUESDAY,
      unansweredStops: 1,
      clocksDisagree: true,
    });
    expect(story.leftoversLine).toBe(
      "Leftovers: Home Depot $87 — which house? · 1 stop still needs a reason. · The van and the clock don't match.",
    );
    expect(story.isQuietNight).toBe(false);
  });

  it("never uses MBA or GPS-archaeology words", () => {
    const story = companyDayStory({
      ...TUESDAY,
      clocksDisagree: true,
      unansweredStops: 1,
    });
    const blob = [
      story.housesLine,
      story.billsLine,
      story.comingBackLine,
      story.leftoversLine,
    ].join(" ");
    expect(blob).not.toMatch(
      /cogs|ar aging|opex|gps|odometer|segment|work order|visit candidate|invoice|accounts receivable/i,
    );
  });
});

describe("assembleCompanyDayStoryInput", () => {
  it("counts unique houses from visits, production story, and named stops", () => {
    const input = assembleCompanyDayStoryInput({
      productionHouses: ["4 Ash St", "12 Elm St"],
      visitHouses: ["4 Ash St"],
      stopHouses: ["68 Claremont Ave", "Home Depot"],
      timeEntries: [
        { activityType: "job_work", durationMinutes: 120 },
        { activityType: "travel", durationMinutes: 40 },
      ],
      milesOdometer: 48.2,
      milesGps: 51,
      milesFlagged: false,
      clockedMinutes: 180,
      attributedMinutes: 175,
      bills: [
        { id: "i1", status: "sent", houseLabel: "4 Ash St", clientName: "Peter Marinelli" },
        { id: "i2", status: "draft", houseLabel: "12 Elm St", clientName: "Jo Elm" },
        { id: "i3", status: "paid", houseLabel: "4 Ash St", clientName: "Peter Marinelli" },
      ],
      comingBack: [
        {
          when: "2026-09-24T12:00:00-04:00",
          houseLabel: "4 Ash St",
          startHere: "closet doors still in the truck",
        },
      ],
      leftoverReceipts: [{ vendor: "Home Depot", amountCents: 8700 }],
      unansweredStops: 0,
    });
    expect(input.houseCount).toBe(3);
    expect(input.jobMinutes).toBe(120);
    expect(input.miles).toBe(48);
    expect(input.billsSent).toBe(2);
    expect(input.billsOnHold).toEqual([
      { houseLabel: "12 Elm St", clientName: "Jo Elm", invoiceId: "i2" },
    ]);
    expect(input.clocksDisagree).toBe(false);
    expect(input.leftoverReceipts).toHaveLength(1);
  });

  it("prefers odometer miles and flags a clock mismatch from the van", () => {
    const input = assembleCompanyDayStoryInput({
      productionHouses: [],
      visitHouses: [],
      stopHouses: [],
      timeEntries: [],
      milesOdometer: null,
      milesGps: 12.4,
      milesFlagged: true,
      clockedMinutes: null,
      attributedMinutes: null,
      bills: [],
      comingBack: [],
      leftoverReceipts: [],
      unansweredStops: 0,
    });
    expect(input.miles).toBe(12);
    expect(input.clocksDisagree).toBe(true);
  });

  it("flags clocks disagree when clocked hours and job hours are far apart", () => {
    const input = assembleCompanyDayStoryInput({
      productionHouses: ["4 Ash St"],
      visitHouses: [],
      stopHouses: [],
      timeEntries: [{ activityType: "job_work", durationMinutes: 60 }],
      milesOdometer: 10,
      milesGps: 10,
      milesFlagged: false,
      clockedMinutes: 300,
      attributedMinutes: 60,
      bills: [],
      comingBack: [],
      leftoverReceipts: [],
      unansweredStops: 0,
    });
    expect(input.clocksDisagree).toBe(true);
  });

  it("does not treat a store place as a house", () => {
    const input = assembleCompanyDayStoryInput({
      productionHouses: [],
      visitHouses: [],
      stopHouses: ["Home Depot", "Lowe's", "private"],
      timeEntries: [],
      milesOdometer: null,
      milesGps: 0,
      milesFlagged: false,
      clockedMinutes: null,
      attributedMinutes: null,
      bills: [{ id: "v", status: "void", houseLabel: "4 Ash", clientName: "P" }],
      comingBack: [],
      leftoverReceipts: [],
      unansweredStops: 1,
    });
    expect(input.houseCount).toBe(0);
    expect(input.billsSent).toBe(0);
    expect(input.billsOnHold).toEqual([]);
    expect(input.unansweredStops).toBe(1);
    expect(input.miles).toBeNull();
  });
});
