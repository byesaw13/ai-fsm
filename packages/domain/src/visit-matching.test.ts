import { describe, it, expect } from "vitest";
import {
  rankVisitCandidates,
  CLASSIFICATION_TO_ACTIVITY,
  VISIT_CONFIDENCE_FLOOR,
  shouldCreateVisitCandidate,
  VISIT_CANDIDATE_MIN_DWELL_MINUTES,
  shouldEnsureFieldDayVisit,
  shouldRelearnPropertyCoords,
  PROPERTY_COORD_RELEARN_METERS,
  resolveWorkOrderForProperty,
  isLivePromptEligible,
  LIVE_PROMPT_CONFIDENCE_FLOOR,
  type VisitMatchCandidate,
  type OpenWorkOrderOption,
} from "./visit-matching";

const prop = (over: Partial<VisitMatchCandidate> & { propertyId: string; clientId: string }): VisitMatchCandidate => ({
  latitude: null,
  longitude: null,
  ...over,
});

describe("rankVisitCandidates", () => {
  it("scores a scheduled-today visit highest, even without coordinates", () => {
    const [top] = rankVisitCandidates({
      stop: { latitude: null, longitude: null, durationMinutes: 36 },
      candidates: [prop({ propertyId: "p1", clientId: "c1", scheduledToday: true, jobId: "j1", visitId: "v1" })],
    });
    expect(top.score).toBe(100); // 100 + 30 (15min) clamped
    expect(top.reasons).toEqual(expect.arrayContaining(["scheduled_today", "stayed_15min"]));
    expect(top.score).toBeGreaterThanOrEqual(VISIT_CONFIDENCE_FLOOR);
  });

  it("adds distance points only when both stop and property have coords", () => {
    const stopAt = { latitude: 42.9956, longitude: -71.4548, durationMinutes: 10 };
    // ~30 m away → within 150 ft
    const near = prop({ propertyId: "p1", clientId: "c1", latitude: 42.99578, longitude: -71.4548 });
    const noCoords = prop({ propertyId: "p2", clientId: "c2" });
    const ranked = rankVisitCandidates({ stop: stopAt, candidates: [near, noCoords] });
    const nearM = ranked.find((m) => m.propertyId === "p1")!;
    const farM = ranked.find((m) => m.propertyId === "p2")!;
    expect(nearM.reasons).toContain("within_150ft");
    expect(nearM.distanceMeters).toBeLessThan(46);
    expect(farM.distanceMeters).toBeNull();
    expect(nearM.rawScore).toBeGreaterThan(farM.rawScore);
  });

  it("ranks an open job above a merely recent client", () => {
    const ranked = rankVisitCandidates({
      stop: { latitude: 42.87, longitude: -71.31, durationMinutes: 6 },
      candidates: [
        prop({ propertyId: "open", clientId: "c1", latitude: 42.8701, longitude: -71.3101, openJob: true, jobId: "j1" }),
        prop({ propertyId: "recent", clientId: "c2", latitude: 42.8702, longitude: -71.3102, recentClient: true }),
      ],
    });
    expect(ranked[0].propertyId).toBe("open");
  });

  it("does not score an open job when distance cannot be checked", () => {
    const [match] = rankVisitCandidates({
      stop: { latitude: 42.87, longitude: -71.31, durationMinutes: 77 },
      candidates: [prop({ propertyId: "mary", clientId: "c1", openJob: true, jobId: "j1" })],
    });
    expect(match.rawScore).toBe(0);
    expect(match.score).toBeLessThan(VISIT_CONFIDENCE_FLOOR);
  });

  it("penalizes poor GPS accuracy", () => {
    const base = { latitude: 42.87, longitude: -71.31, durationMinutes: 20 };
    const candidate = prop({ propertyId: "p", clientId: "c", latitude: 42.8701, longitude: -71.3101, openJob: true });
    const good = rankVisitCandidates({ stop: base, candidates: [candidate] })[0];
    const poor = rankVisitCandidates({ stop: { ...base, gpsAccuracyMeters: 120 }, candidates: [candidate] })[0];
    expect(poor.rawScore).toBe(good.rawScore - 25);
    expect(poor.reasons).toContain("poor_gps");
  });

  it("clamps the stored score to 0–100", () => {
    const [m] = rankVisitCandidates({
      stop: { latitude: 1, longitude: 1, durationMinutes: 30 },
      candidates: [prop({ propertyId: "p", clientId: "c", scheduledToday: true, openJob: true, recentClient: true, latitude: 1, longitude: 1 })],
    });
    expect(m.rawScore).toBeGreaterThan(100);
    expect(m.score).toBe(100);
  });

  it("hard-rejects a far stop even with open job + long dwell (Floss-at-home bug)", () => {
    // Brian Floss pin (Maynard) vs home (Derry) ~50 km
    const [m] = rankVisitCandidates({
      stop: { latitude: 42.8748, longitude: -71.3114, durationMinutes: 900 },
      candidates: [
        prop({
          propertyId: "floss",
          clientId: "c-floss",
          latitude: 42.4385168,
          longitude: -71.4349672,
          openJob: true,
          recentClient: true,
          jobId: "j-floss",
        }),
      ],
    });
    expect(m.score).toBe(0);
    expect(m.rawScore).toBe(0);
    expect(m.reasons).toEqual(["too_far"]);
    expect(m.distanceMeters).toBeGreaterThan(40_000);
  });

  it("still matches when near the property with open job", () => {
    const [m] = rankVisitCandidates({
      stop: { latitude: 42.43852, longitude: -71.43497, durationMinutes: 60 },
      candidates: [
        prop({
          propertyId: "floss",
          clientId: "c-floss",
          latitude: 42.4385168,
          longitude: -71.4349672,
          openJob: true,
          jobId: "j-floss",
        }),
      ],
    });
    expect(m.score).toBeGreaterThanOrEqual(VISIT_CONFIDENCE_FLOOR);
    expect(m.reasons).toContain("open_job");
    expect(m.reasons).not.toContain("too_far");
  });
});

describe("CLASSIFICATION_TO_ACTIVITY", () => {
  it("maps each non-ignore classification to a real activity type", () => {
    expect(CLASSIFICATION_TO_ACTIVITY.job_work).toBe("job_work");
    expect(CLASSIFICATION_TO_ACTIVITY.warranty_callback).toBe("job_work");
    expect(CLASSIFICATION_TO_ACTIVITY.estimate_visit).toBe("estimate_visit");
    expect(CLASSIFICATION_TO_ACTIVITY.walkthrough).toBe("estimate_visit");
    expect(CLASSIFICATION_TO_ACTIVITY.material_drop).toBe("material_run");
    expect(CLASSIFICATION_TO_ACTIVITY.realtor).toBe("follow_up");
  });
});

describe("shouldEnsureFieldDayVisit", () => {
  it("requires a job, field classification, and enough dwell", () => {
    expect(
      shouldEnsureFieldDayVisit({
        classification: "job_work",
        jobId: "j1",
        durationMinutes: 60,
      }),
    ).toBe(true);
    expect(
      shouldEnsureFieldDayVisit({
        classification: "warranty_callback",
        jobId: "j1",
        durationMinutes: 20,
      }),
    ).toBe(true);
    expect(
      shouldEnsureFieldDayVisit({
        classification: "job_work",
        jobId: null,
        durationMinutes: 60,
      }),
    ).toBe(false);
    expect(
      shouldEnsureFieldDayVisit({
        classification: "material_drop",
        jobId: "j1",
        durationMinutes: 60,
      }),
    ).toBe(false);
    expect(
      shouldEnsureFieldDayVisit({
        classification: "job_work",
        jobId: "j1",
        durationMinutes: 5,
      }),
    ).toBe(false);
  });
});

describe("shouldRelearnPropertyCoords", () => {
  it("bootstraps when property has no coords", () => {
    const d = shouldRelearnPropertyCoords({
      storedLatitude: null,
      storedLongitude: null,
      stopLatitude: 42.97,
      stopLongitude: -71.45,
    });
    expect(d).toEqual({ relearn: true, reason: "missing", distanceMeters: null });
  });

  it("relearns when stop is far from stored pin", () => {
    // ~15 km — the Joseph poison-pin case
    const d = shouldRelearnPropertyCoords({
      storedLatitude: 42.862,
      storedLongitude: -71.349,
      stopLatitude: 42.9717,
      stopLongitude: -71.4566,
    });
    expect(d.relearn).toBe(true);
    expect(d.reason).toBe("far");
    if (d.reason === "far") {
      expect(d.distanceMeters).toBeGreaterThan(PROPERTY_COORD_RELEARN_METERS);
    }
  });

  it("keeps coords when stop is near the pin", () => {
    const d = shouldRelearnPropertyCoords({
      storedLatitude: 42.97173,
      storedLongitude: -71.45661,
      stopLatitude: 42.97175,
      stopLongitude: -71.45660,
    });
    expect(d.relearn).toBe(false);
    expect(d.reason).toBe("keep");
  });

  it("skips when the stop has no coords", () => {
    const d = shouldRelearnPropertyCoords({
      storedLatitude: 42.97,
      storedLongitude: -71.45,
      stopLatitude: null,
      stopLongitude: null,
    });
    expect(d).toEqual({ relearn: false, reason: "no_stop_coords", distanceMeters: null });
  });
});


describe("shouldCreateVisitCandidate (TASK-079 dwell floor)", () => {
  it("rejects a below-floor confidence", () => {
    expect(shouldCreateVisitCandidate({ score: VISIT_CONFIDENCE_FLOOR - 1, durationMinutes: 30, hasScheduledVisit: false })).toBe(false);
  });
  it("rejects a sub-dwell stop with no scheduled visit (jitter)", () => {
    expect(shouldCreateVisitCandidate({ score: 90, durationMinutes: VISIT_CANDIDATE_MIN_DWELL_MINUTES - 1, hasScheduledVisit: false })).toBe(false);
    expect(shouldCreateVisitCandidate({ score: 90, durationMinutes: 0, hasScheduledVisit: false })).toBe(false);
  });
  it("keeps a real-dwell stop", () => {
    expect(shouldCreateVisitCandidate({ score: 90, durationMinutes: VISIT_CANDIDATE_MIN_DWELL_MINUTES, hasScheduledVisit: false })).toBe(true);
  });
  it("keeps even a brief stop when a visit is scheduled there today", () => {
    expect(shouldCreateVisitCandidate({ score: 90, durationMinutes: 0, hasScheduledVisit: true })).toBe(true);
  });
  it("rejects known-far matches even when scheduled today", () => {
    expect(
      shouldCreateVisitCandidate({
        score: 100,
        durationMinutes: 60,
        hasScheduledVisit: true,
        distanceMeters: 50_000,
      }),
    ).toBe(false);
  });
});

const wo = (id: string, extra: Partial<OpenWorkOrderOption> = {}): OpenWorkOrderOption => ({
  id,
  title: `WO ${id}`,
  status: "scheduled",
  scheduledToday: false,
  ...extra,
});

describe("resolveWorkOrderForProperty", () => {
  it("returns clear when exactly one open WO", () => {
    const r = resolveWorkOrderForProperty({ openWorkOrders: [wo("a")], overrideWorkOrderId: null });
    expect(r).toEqual({
      status: "clear",
      workOrderId: "a",
      visitId: null,
      options: [expect.objectContaining({ id: "a" })],
    });
  });

  it("returns ambiguous when multiple open WOs even if one is scheduled today", () => {
    const r = resolveWorkOrderForProperty({
      openWorkOrders: [wo("a", { scheduledToday: true, visitId: "v1" }), wo("b")],
      overrideWorkOrderId: null,
    });
    expect(r.status).toBe("ambiguous");
    expect(r.workOrderId).toBeNull();
    expect(r.options).toHaveLength(2);
  });

  it("returns none when no open WOs", () => {
    const r = resolveWorkOrderForProperty({ openWorkOrders: [], overrideWorkOrderId: null });
    expect(r.status).toBe("none");
    expect(r.workOrderId).toBeNull();
  });

  it("honors override when it matches an open WO", () => {
    const r = resolveWorkOrderForProperty({
      openWorkOrders: [wo("a"), wo("b", { visitId: "v2", scheduledToday: true })],
      overrideWorkOrderId: "b",
    });
    expect(r).toEqual({
      status: "clear",
      workOrderId: "b",
      visitId: "v2",
      options: expect.any(Array),
    });
  });

  it("ignores override that is not in the open list", () => {
    const r = resolveWorkOrderForProperty({
      openWorkOrders: [wo("a"), wo("b")],
      overrideWorkOrderId: "zzz",
    });
    expect(r.status).toBe("ambiguous");
  });
});

describe("isLivePromptEligible", () => {
  const base = {
    workdayOpen: true,
    confidenceScore: 90,
    distanceProven: true,
    scheduledToday: true,
    alreadyPrompted: false,
    status: "pending" as const,
  };

  it("true when all high bars pass", () => {
    expect(isLivePromptEligible(base)).toBe(true);
  });

  it("false when workday closed", () => {
    expect(isLivePromptEligible({ ...base, workdayOpen: false })).toBe(false);
  });

  it("false when confidence below floor", () => {
    expect(isLivePromptEligible({ ...base, confidenceScore: LIVE_PROMPT_CONFIDENCE_FLOOR - 1 })).toBe(false);
  });

  it("false when not distance-proven", () => {
    expect(isLivePromptEligible({ ...base, distanceProven: false })).toBe(false);
  });

  it("false when not scheduled today", () => {
    expect(isLivePromptEligible({ ...base, scheduledToday: false })).toBe(false);
  });

  it("false when already prompted or not pending", () => {
    expect(isLivePromptEligible({ ...base, alreadyPrompted: true })).toBe(false);
    expect(isLivePromptEligible({ ...base, status: "confirmed" })).toBe(false);
  });
});
