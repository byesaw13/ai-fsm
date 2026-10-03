import { describe, expect, it } from "vitest";
import {
  fieldPlaceTitle,
  leaveChecks,
  materialsNeededLine,
  openFieldTasks,
  restOfVisitHeading,
  showLeaveList,
  todayCommand,
  visitCommand,
  visitFaceStatus,
} from "../face";

describe("today command", () => {
  it("sends you to the house until you are on site", () => {
    expect(todayCommand("scheduled", true)).toEqual({ verb: "navigate", label: "Navigate" });
    expect(todayCommand("traveling", true)).toEqual({ verb: "navigate", label: "Navigate" });
    expect(todayCommand("scheduled", false)).toEqual({ verb: "start", label: "Start job" });
  });

  it("continues work once the visit is underway", () => {
    expect(todayCommand("in_progress", true).label).toBe("Continue work");
    expect(todayCommand("arrived", true).verb).toBe("continue");
  });
});

describe("visit face", () => {
  it("uses the customer as the place, then the street", () => {
    expect(fieldPlaceTitle("Smith", "12 Oak")).toBe("Smith");
    expect(fieldPlaceTitle("  ", "12 Oak")).toBe("12 Oak");
  });

  it("counts needed material lines and hides an empty list", () => {
    expect(materialsNeededLine(null)).toBeNull();
    expect(materialsNeededLine("\n  \n")).toBeNull();
    expect(materialsNeededLine("joint compound")).toBe("1 item still needed");
    expect(materialsNeededLine("mud\ntape")).toBe("2 items still needed");
  });

  it("names the other tasks from the current task, not a guess", () => {
    expect(restOfVisitHeading("open")).toBe("Still on this visit");
    expect(restOfVisitHeading("partial")).toBe("While that dries");
    expect(openFieldTasks([
      { completed: false, status: "open", id: "a" },
      { completed: true, status: "done", id: "b" },
      { completed: false, status: "partial", id: "c" },
    ]).map((task) => task.id)).toEqual(["a", "c"]);
  });

  it("says where the visit is in one word", () => {
    expect(visitFaceStatus("scheduled")).toBe("Next");
    expect(visitFaceStatus("in_progress")).toBe("In progress");
  });

  it("starts a work visit before it offers to complete a task", () => {
    expect(visitCommand({
      status: "scheduled",
      fieldKind: "standard",
      hasOpenTask: true,
      hasAddress: true,
    })).toEqual({ kind: "start", label: "Start job", nextStatus: "arrived" });
    const arrived = visitCommand({
      status: "arrived",
      fieldKind: "repair",
      hasOpenTask: true,
      hasAddress: true,
    });
    expect(arrived.kind === "start" && arrived.nextStatus).toBe("in_progress");
    expect(visitCommand({
      status: "in_progress",
      fieldKind: "standard",
      hasOpenTask: true,
      hasAddress: true,
    }).kind).toBe("task");
    expect(visitCommand({
      status: "in_progress",
      fieldKind: "membership",
      hasOpenTask: true,
      hasAddress: true,
    }).kind).toBe("none");
    expect(visitCommand({
      status: "scheduled",
      fieldKind: "site_visit",
      hasOpenTask: false,
      hasAddress: true,
    }).label).toBe("Open assessment");
    expect(visitCommand({
      status: "in_progress",
      fieldKind: "site_visit",
      hasOpenTask: false,
      hasAddress: true,
      assessmentComplete: true,
    }).label).toBe("Complete walkthrough");
    expect(visitCommand({
      status: "traveling",
      fieldKind: "standard",
      hasOpenTask: false,
      hasAddress: false,
    }).kind).toBe("none");
  });

  it("builds leave checks from records that already exist", () => {
    expect(showLeaveList("scheduled")).toBe(false);
    expect(showLeaveList("in_progress")).toBe(true);
    const checks = leaveChecks({
      photoCount: 0,
      materialsUsed: "  ",
      techNotes: "Left the key",
      hasNextVisit: false,
    });
    expect(checks.find((check) => check.key === "note")?.done).toBe(true);
    expect(checks.find((check) => check.key === "photos")?.done).toBe(false);
    expect(checks.find((check) => check.key === "materials")?.done).toBe(false);
    expect(leaveChecks({
      photoCount: 0,
      materialsUsed: "",
      partsRecorded: 2,
      techNotes: "",
      hasNextVisit: false,
    }).find((check) => check.key === "materials")?.done).toBe(true);
  });
});
