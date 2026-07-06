import { describe, it, expect } from "vitest";
import {
  ACTIVITY_TYPES,
  LABOR_BUCKETS,
  laborBucketFor,
  activityCategoryFor,
  isSameActivitySnapshot,
} from "./activities";

describe("laborBucketFor (TASK-053 default mapping)", () => {
  it("job work is billable", () => {
    expect(laborBucketFor("job_work")).toBe("billable");
  });

  it("personal is personal", () => {
    expect(laborBucketFor("personal")).toBe("personal");
  });

  it("everything else defaults to overhead", () => {
    for (const t of ACTIVITY_TYPES) {
      if (t === "job_work" || t === "personal") continue;
      expect(laborBucketFor(t)).toBe("overhead");
    }
  });

  it("a warranty assignment overrides the verb", () => {
    expect(laborBucketFor("job_work", { warranty: true })).toBe("warranty");
    expect(laborBucketFor("travel", { warranty: true })).toBe("warranty");
  });

  it("always returns a valid bucket", () => {
    for (const t of ACTIVITY_TYPES) {
      expect(LABOR_BUCKETS).toContain(laborBucketFor(t));
    }
  });

  it("category mapping still works (unchanged)", () => {
    expect(activityCategoryFor("job_work")).toBe("revenue");
  });
});

describe("isSameActivitySnapshot (TASK-053 verb + assignment independence)", () => {
  const visitId = "00000000-0000-0000-0000-000000000101";

  it("treats identical verb and assignment as a no-op", () => {
    const snap = { activity_type: "job_work", entity_type: "visit", entity_id: visitId, assignment_kind: null };
    expect(isSameActivitySnapshot(snap, { ...snap })).toBe(true);
  });

  it("detects a verb change on the same assignment", () => {
    const current = { activity_type: "job_work", entity_type: "visit", entity_id: visitId };
    const next = { activity_type: "travel", entity_type: "visit", entity_id: visitId };
    expect(isSameActivitySnapshot(current, next)).toBe(false);
  });

  it("detects an assignment change with the same verb", () => {
    const current = { activity_type: "admin", assignment_kind: "office" };
    const next = { activity_type: "admin", assignment_kind: "shop" };
    expect(isSameActivitySnapshot(current, next)).toBe(false);
  });

  it("detects entity vs non-entity assignment changes", () => {
    const current = { activity_type: "job_work", entity_type: "visit", entity_id: visitId };
    const next = { activity_type: "job_work", assignment_kind: "office" };
    expect(isSameActivitySnapshot(current, next)).toBe(false);
  });
});
