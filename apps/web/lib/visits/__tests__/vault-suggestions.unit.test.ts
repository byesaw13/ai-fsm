import { describe, expect, it } from "vitest";
import { buildVaultSuggestion, shouldSuggestVaultItem } from "../vault-suggestions";

describe("vault suggestions", () => {
  it("suggests vault actions only for flagged findings that should become records", () => {
    expect(shouldSuggestVaultItem("fix_now")).toBe(true);
    expect(shouldSuggestVaultItem("monitor")).toBe(true);
    expect(shouldSuggestVaultItem("refer")).toBe(true);
    expect(shouldSuggestVaultItem("optional")).toBe(false);
    expect(shouldSuggestVaultItem("ok")).toBe(false);
    expect(shouldSuggestVaultItem(null)).toBe(false);
  });

  it("maps appliance findings into appliance vault drafts", () => {
    expect(
      buildVaultSuggestion({
        section: "Kitchen",
        item_key: "kit_appliances",
        label: "Appliances",
        note: "Dishwasher is noisy during drain cycle",
      })
    ).toEqual({
      category: "appliance",
      name: "Appliances",
      location: "Kitchen",
      notes: "Suggested from Kitchen checklist: Appliances.\nFinding: Dishwasher is noisy during drain cycle",
    });
  });

  it("maps mechanical checklist findings into mechanical vault drafts", () => {
    expect(
      buildVaultSuggestion({
        section: "Basement / Utility / Mechanical",
        item_key: "mech_hvac",
        label: "HVAC / furnace / AC",
        note: null,
      })
    ).toEqual({
      category: "mechanical",
      name: "HVAC / furnace / AC",
      location: "Basement / Utility",
      notes: "Suggested from Basement / Utility / Mechanical checklist: HVAC / furnace / AC.",
    });
  });

  it("uses monitor category for structural or long-term watch items", () => {
    expect(
      buildVaultSuggestion({
        section: "Attic / Upper Areas",
        item_key: "attic_structure",
        label: "Structural framing (visible)",
        note: "Hairline cracking near ridge beam",
      }).category
    ).toBe("monitor");
  });
});
