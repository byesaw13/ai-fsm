import { describe, it, expect } from "vitest";
import { isEditing, IDLE_MS } from "@/components/LiveRefresh";

// Minimal Element stand-in — isEditing only reads tagName, isContentEditable, getAttribute.
function el(
  tagName: string,
  { editable = false, expanded }: { editable?: boolean; expanded?: string } = {},
) {
  return {
    tagName,
    isContentEditable: editable,
    getAttribute: (name: string) => (name === "aria-expanded" ? expanded ?? null : null),
  } as unknown as Element;
}

const RECENT = 0;
const STALE = IDLE_MS + 1;

describe("isEditing", () => {
  it("blocks refresh while actively typing in a field", () => {
    expect(isEditing(el("INPUT"), RECENT)).toBe(true);
    expect(isEditing(el("TEXTAREA"), RECENT)).toBe(true);
    expect(isEditing(el("DIV", { editable: true }), RECENT)).toBe(true);
  });

  it("allows refresh when a field is focused but typing went idle (lingering focus)", () => {
    expect(isEditing(el("INPUT"), STALE)).toBe(false);
    expect(isEditing(el("TEXTAREA"), STALE)).toBe(false);
    expect(isEditing(el("DIV", { editable: true }), STALE)).toBe(false);
  });

  it("blocks refresh while a menu/combobox is open, regardless of typing", () => {
    expect(isEditing(el("DIV", { expanded: "true" }), STALE)).toBe(true);
    expect(isEditing(el("DIV", { expanded: "false" }), RECENT)).toBe(false);
  });

  it("allows refresh otherwise", () => {
    expect(isEditing(null, RECENT)).toBe(false);
    expect(isEditing(el("BUTTON"), RECENT)).toBe(false);
    expect(isEditing(el("DIV"), RECENT)).toBe(false);
  });
});
