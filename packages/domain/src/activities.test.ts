import { describe, it, expect } from "vitest";
import {
  ACTIVITY_TYPES,
  LABOR_BUCKETS,
  laborBucketFor,
  activityCategoryFor,
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
