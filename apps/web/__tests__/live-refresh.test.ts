import { describe, it, expect } from "vitest";
import { isEditing } from "@/components/LiveRefresh";

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

describe("isEditing", () => {
  it("blocks refresh while editing form fields", () => {
    expect(isEditing(el("INPUT"))).toBe(true);
    expect(isEditing(el("TEXTAREA"))).toBe(true);
    expect(isEditing(el("SELECT"))).toBe(true);
    expect(isEditing(el("DIV", { editable: true }))).toBe(true);
  });

  it("blocks refresh while a menu/combobox is open", () => {
    expect(isEditing(el("DIV", { expanded: "true" }))).toBe(true);
    expect(isEditing(el("DIV", { expanded: "false" }))).toBe(false);
  });

  it("allows refresh otherwise", () => {
    expect(isEditing(null)).toBe(false);
    expect(isEditing(el("BUTTON"))).toBe(false);
    expect(isEditing(el("DIV"))).toBe(false);
  });
});
