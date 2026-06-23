import { describe, it, expect } from "vitest";
import {
  OWNER_QUICK_ACTIONS,
  FIELD_QUICK_ACTIONS,
} from "../quick-actions";

describe("quick actions", () => {
  it("does not expose the Activity Timeline as a quick action (now lives under Reports)", () => {
    // TASK-038 step 3: the Activity Timeline moved to back-office — it's reached
    // from a persistent link in the Reports header, not the dashboard quick
    // actions. Guard against it creeping back into either surface.
    for (const set of [OWNER_QUICK_ACTIONS, FIELD_QUICK_ACTIONS]) {
      expect(set.some((a) => a.href === "/app/timeline")).toBe(false);
    }
  });

  it("every quick action has a well-formed internal href, label, and icon", () => {
    for (const action of [...OWNER_QUICK_ACTIONS, ...FIELD_QUICK_ACTIONS]) {
      expect(action.href.startsWith("/app/")).toBe(true);
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.icon.length).toBeGreaterThan(0);
    }
  });

  it("labels are unique within each surface", () => {
    for (const set of [OWNER_QUICK_ACTIONS, FIELD_QUICK_ACTIONS]) {
      const labels = set.map((a) => a.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});
