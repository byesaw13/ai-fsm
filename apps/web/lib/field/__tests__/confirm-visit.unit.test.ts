import { describe, it, expect } from "vitest";
import { entityLinkFromCandidate } from "../confirm-visit";
import {
  shouldEnsureFieldDayVisit,
  shouldRelearnPropertyCoords,
} from "@ai-fsm/domain";

describe("entityLinkFromCandidate", () => {
  it("prefers visit over job so labor attaches to the field day", () => {
    expect(
      entityLinkFromCandidate({
        visit_id: "v1",
        job_id: "j1",
        matched_client_id: "c1",
      }),
    ).toEqual(["visit", "v1"]);
  });

  it("falls back to job then client", () => {
    expect(
      entityLinkFromCandidate({
        visit_id: null,
        job_id: "j1",
        matched_client_id: "c1",
      }),
    ).toEqual(["job", "j1"]);
    expect(
      entityLinkFromCandidate({
        visit_id: null,
        job_id: null,
        matched_client_id: "c1",
      }),
    ).toEqual(["client", "c1"]);
    expect(
      entityLinkFromCandidate({
        visit_id: null,
        job_id: null,
        matched_client_id: null,
      }),
    ).toEqual([null, null]);
  });
});

describe("field-day + coord rules (domain, used by confirm-visit)", () => {
  it("auto field-day only for substantial on-site job work", () => {
    expect(
      shouldEnsureFieldDayVisit({
        classification: "job_work",
        jobId: "j",
        durationMinutes: 90,
      }),
    ).toBe(true);
    expect(
      shouldEnsureFieldDayVisit({
        classification: "estimate_visit",
        jobId: "j",
        durationMinutes: 90,
      }),
    ).toBe(false);
  });

  it("relearns poisoned pins beyond 500m", () => {
    const d = shouldRelearnPropertyCoords({
      storedLatitude: 42.86,
      storedLongitude: -71.35,
      stopLatitude: 42.97,
      stopLongitude: -71.46,
    });
    expect(d.relearn).toBe(true);
    expect(d.reason).toBe("far");
  });
});
