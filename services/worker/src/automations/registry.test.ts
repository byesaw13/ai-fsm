import { describe, it, expect } from "vitest";
import {
  AUTOMATION_REGISTRY,
  DISPATCHED_AUTOMATION_TYPES,
} from "./registry.js";

describe("AUTOMATION_REGISTRY", () => {
  it("dispatches exactly 12 automation types", () => {
    expect(AUTOMATION_REGISTRY).toHaveLength(12);
    expect([...DISPATCHED_AUTOMATION_TYPES]).toHaveLength(12);
  });

  it("registry types match DISPATCHED_AUTOMATION_TYPES exactly", () => {
    const registryTypes = AUTOMATION_REGISTRY.map((def) => def.type).sort();
    const expected = [...DISPATCHED_AUTOMATION_TYPES].sort();
    expect(registryTypes).toEqual(expected);
  });

  it("intentionally excludes membership_renewal_nudge (paused)", () => {
    const types = AUTOMATION_REGISTRY.map((def) => def.type);
    expect(types).not.toContain("membership_renewal_nudge");
  });

  it("includes lead_followup despite missing from automationTypeSchema (K10 follow-up)", () => {
    const types = AUTOMATION_REGISTRY.map((def) => def.type);
    expect(types).toContain("lead_followup");
  });

  it("has two seasonal reminder entries (spring and fall)", () => {
    const seasonal = AUTOMATION_REGISTRY.filter((def) =>
      def.type.startsWith("seasonal_reminder_")
    );
    expect(seasonal).toHaveLength(2);
    expect(seasonal.map((d) => d.type).sort()).toEqual([
      "seasonal_reminder_fall",
      "seasonal_reminder_spring",
    ]);
  });

  it("each definition has required hooks", () => {
    for (const def of AUTOMATION_REGISTRY) {
      expect(def.type).toBeTruthy();
      expect(def.logLabel).toBeTruthy();
      expect(typeof def.findDue).toBe("function");
      expect(typeof def.process).toBe("function");
      expect(typeof def.advanceNextRun).toBe("function");
    }
  });
});