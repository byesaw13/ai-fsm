import { describe, it, expect } from "vitest";
import {
  NEW_ACTIONS,
  NEW_MORE_ACTIONS,
  fieldReceiptHref,
  newActionHref,
} from "../quick-actions";

describe("one New button (TASK-236)", () => {
  it("offers exactly three plain choices", () => {
    expect(NEW_ACTIONS.map((a) => a.label)).toEqual([
      "Someone called",
      "Quick job",
      "Receipt, photo or note",
    ]);
  });

  it("someone called opens intake; quick job opens the quick-book form; receipt/photo/note opens Capture", () => {
    expect(NEW_ACTIONS[0]).toMatchObject({ href: "/app/intake/new" });
    expect(NEW_ACTIONS[1]).toMatchObject({ action: "quick-book" });
    expect(NEW_ACTIONS[2]).toMatchObject({ href: "/app/capture" });
  });

  it("keeps the rarer starts under More, in shop words", () => {
    expect(NEW_MORE_ACTIONS.map((a) => a.label)).toEqual([
      "Receipt for a job",
      "Material run",
      "Log mileage",
      "Invoice without a job",
      "Full job form",
      "Full estimate form",
    ]);
  });

  it("does not offer the retired duplicate starts", () => {
    const labels = [...NEW_ACTIONS, ...NEW_MORE_ACTIONS].map((a) => a.label);
    for (const gone of ["Quick Estimate", "New Job", "New Request", "Capture", "Schedule"]) {
      expect(labels).not.toContain(gone);
    }
    expect([...NEW_ACTIONS, ...NEW_MORE_ACTIONS].some((a) => a.href === "/app/estimates/quick")).toBe(false);
  });

  it("every action has an internal href, a label and an icon, and labels are unique", () => {
    const all = [...NEW_ACTIONS, ...NEW_MORE_ACTIONS];
    for (const action of all) {
      expect(action.href.startsWith("/app/")).toBe(true);
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.icon.length).toBeGreaterThan(0);
    }
    expect(new Set(all.map((a) => a.label)).size).toBe(all.length);
  });

  it("never offers vehicle tracking as a start", () => {
    expect([...NEW_ACTIONS, ...NEW_MORE_ACTIONS].some((a) => a.href === "/app/timeline")).toBe(false);
  });

  it("pins a receipt to the open job when there is one", () => {
    const receipt = NEW_MORE_ACTIONS[0];
    expect(newActionHref(receipt, "fc42141c-870d-4af3-9933-b2e03d4950a0")).toBe(
      "/app/expenses/new?job=fc42141c-870d-4af3-9933-b2e03d4950a0",
    );
    expect(newActionHref(receipt, null)).toBe("/app/expenses/new");
    expect(newActionHref(NEW_ACTIONS[0], "abc")).toBe("/app/intake/new");
    expect(fieldReceiptHref(null)).toBe("/app/expenses/new");
  });
});
