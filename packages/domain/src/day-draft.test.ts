import { describe, it, expect } from "vitest";
import {
  assembleDayDraft,
  classificationFromSignals,
  expenseMatchesPlace,
  formatHours,
  reconcile,
  type DayDraftEvidence,
  type DayDraftEvidenceSegment,
} from "./day-draft";

const t = (hhmm: string) => `2026-08-11T${hhmm}:00.000Z`;

function seg(over: Partial<DayDraftEvidenceSegment> & Pick<DayDraftEvidenceSegment, "id" | "kind">): DayDraftEvidenceSegment {
  return {
    startedAt: t("13:00"),
    endedAt: t("15:00"),
    placeLabel: "68 Claremont",
    zone: null,
    status: "provisional",
    activityEntryId: null,
    suggestedActivity: null,
    vehicleId: null,
    estimatedMiles: null,
    isLikelyNoise: false,
    ...over,
  };
}

function evidence(over: Partial<DayDraftEvidence> = {}): DayDraftEvidence {
  return {
    segments: [],
    candidates: [],
    expenses: [],
    loggedEntries: [],
    clockedMinutes: 480,
    defaultVehicleId: "veh-ram",
    visitScoreFloor: 40,
    ...over,
  };
}

describe("expenseMatchesPlace", () => {
  it("matches a Home Depot receipt to a Home Depot stop", () => {
    expect(
      expenseMatchesPlace("Home Depot", [{ vendor: "The Home Depot", category: "materials", notes: null }]),
    ).toBe("The Home Depot");
  });
  it("ignores unrelated receipts", () => {
    expect(expenseMatchesPlace("41 Nashua Rd", [{ vendor: "Shell", category: "fuel", notes: null }])).toBeNull();
  });
});

describe("classificationFromSignals", () => {
  it("maps estimate / warranty visit types", () => {
    expect(classificationFromSignals({ visitType: "estimate", suggestedActivity: null })).toBe("estimate_visit");
    expect(classificationFromSignals({ visitType: "warranty_callback", suggestedActivity: null })).toBe("warranty_callback");
  });
  it("defaults to job work", () => {
    expect(classificationFromSignals({ visitType: null, suggestedActivity: null })).toBe("job_work");
  });
});

describe("assembleDayDraft", () => {
  it("marks a scheduled high-confidence stop ready as job work", () => {
    const draft = assembleDayDraft(evidence({
      segments: [seg({ id: "s1", kind: "stop", placeLabel: "68 Claremont", startedAt: t("13:00"), endedAt: t("15:10") })],
      candidates: [{
        id: "c1",
        segmentId: "s1",
        clientName: "Joseph Legerstee",
        propertyAddress: "68 Claremont",
        score: 92,
        jobId: "job-1",
        visitId: "vis-1",
        workOrderId: "wo-1",
        clientId: "cli-1",
        woResolution: "clear",
        visitType: "job",
      }],
    }));
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0].ready).toBe(true);
    expect(draft.items[0].proposedActivity).toBe("job_work");
    expect(draft.items[0].proposedClassification).toBe("job_work");
    expect(draft.items[0].confidence).toBe("high");
    expect(draft.items[0].label).toContain("Joseph");
    expect(draft.readyCount).toBe(1);
    expect(draft.exceptionCount).toBe(0);
  });

  it("holds an ambiguous work-order match as an exception", () => {
    const draft = assembleDayDraft(evidence({
      segments: [seg({ id: "s1", kind: "stop" })],
      candidates: [{
        id: "c1",
        segmentId: "s1",
        clientName: "Kim Tufts",
        propertyAddress: "Wells",
        score: 88,
        jobId: "job-1",
        visitId: "vis-1",
        workOrderId: null,
        clientId: "cli-1",
        woResolution: "ambiguous",
        visitType: "job",
      }],
    }));
    expect(draft.items[0].ready).toBe(false);
    expect(draft.items[0].exception).toBe("Pick a work order");
    expect(draft.exceptionCount).toBe(1);
  });

  it("accepts a supply-house stop with a matching receipt", () => {
    const draft = assembleDayDraft(evidence({
      segments: [seg({
        id: "s2",
        kind: "stop",
        placeLabel: "Home Depot",
        zone: "Home Depot",
        startedAt: t("16:00"),
        endedAt: t("16:22"),
        suggestedActivity: "material_run",
      })],
      expenses: [{ vendor: "The Home Depot", category: "materials", notes: "screws" }],
    }));
    expect(draft.items[0].ready).toBe(true);
    expect(draft.items[0].proposedActivity).toBe("material_run");
    expect(draft.items[0].expenseHint).toBe("The Home Depot");
  });

  it("accepts a drive with GPS miles and a default vehicle", () => {
    const draft = assembleDayDraft(evidence({
      segments: [seg({
        id: "d1",
        kind: "drive",
        placeLabel: null,
        startedAt: t("12:00"),
        endedAt: t("12:22"),
        estimatedMiles: 11.4,
      })],
    }));
    expect(draft.items[0].ready).toBe(true);
    expect(draft.items[0].proposedActivity).toBe("travel");
    expect(draft.items[0].estimatedMiles).toBe(11.4);
    expect(draft.items[0].vehicleId).toBe("veh-ram");
  });

  it("flags a drive with no GPS miles", () => {
    const draft = assembleDayDraft(evidence({
      segments: [seg({ id: "d1", kind: "drive", estimatedMiles: null, startedAt: t("12:00"), endedAt: t("12:10") })],
    }));
    expect(draft.items[0].ready).toBe(false);
    expect(draft.items[0].exception).toBe("No GPS miles to confirm");
  });

  it("flags an unlabeled customer-looking stop", () => {
    const draft = assembleDayDraft(evidence({
      segments: [seg({ id: "s3", kind: "stop", placeLabel: "41 Nashua Rd, Londonderry, NH", startedAt: t("11:00"), endedAt: t("11:40") })],
    }));
    expect(draft.items[0].ready).toBe(false);
    expect(draft.items[0].exception).toBe("No matching job");
  });

  it("skips Home, noise, dismissed, and still-open segments", () => {
    const draft = assembleDayDraft(evidence({
      segments: [
        seg({ id: "home", kind: "stop", placeLabel: "Home", zone: "home" }),
        seg({ id: "noise", kind: "stop", isLikelyNoise: true, startedAt: t("10:00"), endedAt: t("10:01") }),
        seg({ id: "gone", kind: "stop", status: "dismissed" }),
        seg({ id: "open", kind: "stop", endedAt: null }),
      ],
    }));
    expect(draft.items.filter((i) => i.kind !== "gap")).toHaveLength(0);
  });

  it("marks an already-confirmed stop as logged, not ready", () => {
    const draft = assembleDayDraft(evidence({
      segments: [seg({ id: "s1", kind: "stop", status: "confirmed", activityEntryId: "ae-1" })],
    }));
    expect(draft.items[0].alreadyLogged).toBe(true);
    expect(draft.items[0].ready).toBe(false);
    expect(draft.alreadyLoggedCount).toBe(1);
    expect(draft.readyCount).toBe(0);
  });

  it("treats a provisional stop fully covered by the ledger as already logged", () => {
    const draft = assembleDayDraft(evidence({
      segments: [seg({ id: "s1", kind: "stop", startedAt: t("13:00"), endedAt: t("15:00") })],
      loggedEntries: [{ startedAt: t("12:00"), endedAt: t("16:00") }],
    }));
    expect(draft.items[0].alreadyLogged).toBe(true);
    expect(draft.items[0].ready).toBe(false);
  });

  it("flags a partial overlap instead of marking it ready", () => {
    const draft = assembleDayDraft(evidence({
      segments: [seg({
        id: "s1",
        kind: "stop",
        placeLabel: "Home Depot",
        zone: "Home Depot",
        suggestedActivity: "material_run",
        startedAt: t("13:00"),
        endedAt: t("15:00"),
      })],
      loggedEntries: [{ startedAt: t("14:00"), endedAt: t("14:30") }],
    }));
    expect(draft.items[0].ready).toBe(false);
    expect(draft.items[0].exception).toBe("Overlaps logged time");
  });

  it("counts standalone ledger time in attributed minutes", () => {
    const draft = assembleDayDraft(evidence({
      segments: [],
      loggedEntries: [{ startedAt: t("12:00"), endedAt: t("16:00") }],
      clockedMinutes: 240,
    }));
    expect(draft.attributedMinutes).toBe(240);
    expect(draft.reconciliation).toContain("matches the clocked day");
  });

  it("holds an unknown work-order match as an exception", () => {
    const draft = assembleDayDraft(evidence({
      segments: [seg({ id: "s1", kind: "stop" })],
      candidates: [{
        id: "c1",
        segmentId: "s1",
        clientName: "Kim Tufts",
        propertyAddress: "Wells",
        score: 88,
        jobId: "job-1",
        visitId: "vis-1",
        workOrderId: null,
        clientId: "cli-1",
        woResolution: "unknown",
        visitType: "job",
      }],
    }));
    expect(draft.items[0].ready).toBe(false);
    expect(draft.items[0].exception).toBe("Pick a work order");
  });

  it("adds untracked gaps between signal segments", () => {
    const draft = assembleDayDraft(evidence({
      segments: [
        seg({ id: "a", kind: "stop", placeLabel: "Home Depot", zone: "Home Depot", suggestedActivity: "material_run", startedAt: t("12:00"), endedAt: t("12:20") }),
        seg({ id: "b", kind: "stop", placeLabel: "Home Depot", zone: "Home Depot", suggestedActivity: "material_run", startedAt: t("13:00"), endedAt: t("13:20") }),
      ],
    }));
    const gap = draft.items.find((i) => i.kind === "gap");
    expect(gap).toBeTruthy();
    expect(gap?.exception).toBe("Untracked time");
    expect(gap?.minutes).toBe(40);
  });
});

describe("reconcile / formatHours", () => {
  it("formats hours", () => {
    expect(formatHours(45)).toBe("45m");
    expect(formatHours(120)).toBe("2h");
    expect(formatHours(150)).toBe("2h 30m");
  });
  it("notes a matching clock", () => {
    expect(reconcile(470, 480, 3, 0)).toContain("matches the clocked day");
  });
  it("notes unaccounted time", () => {
    expect(reconcile(300, 480, 2, 1)).toContain("3h unaccounted");
  });
});
