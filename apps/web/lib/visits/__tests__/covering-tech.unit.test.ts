import { describe, expect, it } from "vitest";
import {
  coveringTechAssignedToast,
  coveringTechCanOpenJob,
  coveringTechFieldHint,
  coveringTechFieldLabel,
  coveringTechSeesJobOnToday,
  coveringTechStartHere,
  todayCoveringTechSql,
} from "../covering-tech";

describe("covering tech field", () => {
  it("labels the assignee as a Today user, not a dispatch seat", () => {
    expect(coveringTechFieldLabel()).toBe("Covering tech");
    expect(coveringTechFieldHint()).toMatch(/Today/);
    expect(coveringTechFieldLabel().toLowerCase()).not.toContain("dispatch");
  });

  it("confirms they land on Today after assign", () => {
    expect(coveringTechAssignedToast(true)).toBe("They see this job on Today.");
    expect(coveringTechAssignedToast(false)).toBe("Nobody is on Today for this job.");
  });
});

describe("covering tech sees the job on Today", () => {
  const covering = "tech-covering";
  const lead = "tech-lead";

  it("shows the job when they are assigned on the visit, even if someone else is the work-order lead", () => {
    expect(
      coveringTechSeesJobOnToday({
        userId: covering,
        workOrderAssignedUserId: lead,
        visitAssignedUserIds: [covering],
      }),
    ).toBe(true);
  });

  it("shows the job when they are the work-order lead", () => {
    expect(
      coveringTechSeesJobOnToday({
        userId: lead,
        workOrderAssignedUserId: lead,
        visitAssignedUserIds: [],
      }),
    ).toBe(true);
  });

  it("hides the job from someone covering nobody", () => {
    expect(
      coveringTechSeesJobOnToday({
        userId: "other",
        workOrderAssignedUserId: lead,
        visitAssignedUserIds: [covering],
      }),
    ).toBe(false);
  });

  it("lets the covering tech open the job the same way they see it", () => {
    expect(
      coveringTechCanOpenJob({
        userId: covering,
        workOrderAssignedUserId: lead,
        visitAssignedUserIds: [covering],
      }),
    ).toBe(true);
    expect(
      coveringTechCanOpenJob({
        userId: "other",
        workOrderAssignedUserId: lead,
        visitAssignedUserIds: [covering],
      }),
    ).toBe(false);
  });

  it("Today SQL matches visit assignee, not only the work-order lead", () => {
    const sql = todayCoveringTechSql("$2");
    expect(sql).toContain("w.assigned_user_id = $2");
    expect(sql).toContain("cv.assigned_user_id = $2");
    expect(sql).toMatch(/work_order_id = w\.id/);
    expect(sql.toLowerCase()).not.toContain("dispatch");
  });
});

describe("covering tech start-here", () => {
  it("waits with the coming-back first-up", () => {
    expect(coveringTechStartHere("Closet doors still in the truck.")).toBe(
      "Closet doors still in the truck.",
    );
  });

  it("is silent when nothing was left", () => {
    expect(coveringTechStartHere("  ")).toBeNull();
    expect(coveringTechStartHere(null)).toBeNull();
  });
});
