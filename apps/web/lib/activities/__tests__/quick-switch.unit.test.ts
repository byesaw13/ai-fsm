import { describe, it, expect } from "vitest";
import { pickQuickActivities, DEFAULT_QUICK_ACTIVITIES } from "../quick-switch";

const at = (h: number) => `2026-06-11T${String(h).padStart(2, "0")}:00:00.000Z`;

describe("pickQuickActivities", () => {
  it("returns the field defaults when there is no history", () => {
    expect(pickQuickActivities([])).toEqual(DEFAULT_QUICK_ACTIVITIES);
  });

  it("orders recently-used activities most-recent first", () => {
    const out = pickQuickActivities([
      { activity_type: "travel", started_at: at(7) },
      { activity_type: "estimate_visit", started_at: at(9) },
      { activity_type: "invoicing", started_at: at(11) },
    ]);
    // invoicing (11) > estimate_visit (9) > travel (7), then a default to fill 4.
    expect(out.slice(0, 3)).toEqual(["invoicing", "estimate_visit", "travel"]);
    expect(out).toHaveLength(4);
  });

  it("dedupes by latest use and tops up with defaults", () => {
    const out = pickQuickActivities([
      { activity_type: "travel", started_at: at(7) },
      { activity_type: "travel", started_at: at(12) }, // most recent overall
      { activity_type: "job_work", started_at: at(8) },
    ]);
    expect(out[0]).toBe("travel");
    expect(out[1]).toBe("job_work");
    expect(out).toHaveLength(4);
    expect(new Set(out).size).toBe(out.length); // no duplicates
  });

  it("respects a custom count", () => {
    expect(pickQuickActivities([], 2)).toEqual(DEFAULT_QUICK_ACTIVITIES.slice(0, 2));
  });

  it("ignores unknown activity types and bad timestamps", () => {
    const out = pickQuickActivities([
      { activity_type: "yoga", started_at: at(10) },
      { activity_type: "travel", started_at: "not-a-date" },
    ]);
    // Neither contributes usable recency → fall back to defaults.
    expect(out).toEqual(DEFAULT_QUICK_ACTIVITIES);
  });
});
