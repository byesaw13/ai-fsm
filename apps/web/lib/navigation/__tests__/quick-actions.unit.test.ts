import { describe, it, expect } from "vitest";
import {
  OWNER_QUICK_ACTIONS,
  FIELD_QUICK_ACTIONS,
  ACTIVITY_TIMELINE_ACTION,
} from "../quick-actions";

describe("quick actions", () => {
  it("exposes the Activity Timeline to owner/admin but not the field/tech surface", () => {
    // Regression guard: the dashboard's count-gated "Label Captured Locations"
    // action disappears when nothing is pending, so the timeline must always be
    // reachable via a persistent owner Quick Action.
    expect(OWNER_QUICK_ACTIONS).toContainEqual(ACTIVITY_TIMELINE_ACTION);
    expect(ACTIVITY_TIMELINE_ACTION.href).toBe("/app/timeline");
    // It edits the account-wide ledger, so it must NOT appear on the field/tech
    // My Day surface. The /app/timeline route enforces the same guard.
    expect(FIELD_QUICK_ACTIONS).not.toContainEqual(ACTIVITY_TIMELINE_ACTION);
    expect(FIELD_QUICK_ACTIONS.some((a) => a.href === "/app/timeline")).toBe(false);
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
