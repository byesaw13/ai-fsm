import { describe, it, expect } from "vitest";
import {
  OWNER_QUICK_ACTIONS,
  FIELD_QUICK_ACTIONS,
  FAB_QUICK_ACTIONS,
  fieldReceiptHref,
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

  it("puts Capture first on the owner dashboard, not in the tech field strip", () => {
    expect(OWNER_QUICK_ACTIONS[0]).toMatchObject({ label: "Capture", href: "/app/capture" });
    expect(FIELD_QUICK_ACTIONS.some((a) => a.href === "/app/capture")).toBe(false);
  });

  it("Today strip is Job, Receipt, Quote — nothing else", () => {
    expect(FIELD_QUICK_ACTIONS.map((a) => a.label)).toEqual(["Job", "Receipt", "Quote"]);
    expect(FIELD_QUICK_ACTIONS[0]).toMatchObject({ action: "quick-book" });
    expect(FIELD_QUICK_ACTIONS[1].href).toBe("/app/expenses/new");
    expect(FIELD_QUICK_ACTIONS[2].href).toMatch(/^\/app\/estimates/);
  });

  it("exposes Quick job on the global FAB (TASK-119 launch point)", () => {
    expect(FAB_QUICK_ACTIONS.some((a) => a.label === "Quick job" && a.action === "quick-book")).toBe(
      true,
    );
  });

  it("pins a Today receipt to the current job when we know the house", () => {
    expect(fieldReceiptHref("fc42141c-870d-4af3-9933-b2e03d4950a0")).toBe(
      "/app/expenses/new?job=fc42141c-870d-4af3-9933-b2e03d4950a0",
    );
    expect(fieldReceiptHref(null)).toBe("/app/expenses/new");
  });
});
