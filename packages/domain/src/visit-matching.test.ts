import { describe, it, expect } from "vitest";
import {
  rankVisitCandidates,
  CLASSIFICATION_TO_ACTIVITY,
  VISIT_CONFIDENCE_FLOOR,
  type VisitMatchCandidate,
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
