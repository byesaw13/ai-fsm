import { describe, it, expect } from "vitest";
import {
  OWNER_QUICK_ACTIONS,
  FIELD_QUICK_ACTIONS,
} from "../quick-actions";

describe("quick actions", () => {
  it("does not expose vehicle tracking as a field quick action (it lives in Home nav)", () => {
    // Tracking is a Home-hub destination for owner/admin, not a one-tap field
    // shortcut. Guard against it crowding the dashboard / My Day action strips.
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
