import type { ChecklistDisposition, VisitChecklistItem, VaultCategory } from "@ai-fsm/domain";

const SUGGESTED_DISPOSITIONS = new Set<ChecklistDisposition>(["fix_now", "monitor", "refer"]);

const ITEM_KEY_CATEGORY_OVERRIDES: Partial<Record<string, VaultCategory>> = {
  kit_appliances: "appliance",
  mech_hvac: "mechanical",
  mech_water_heater: "mechanical",
  mech_electrical_panel: "mechanical",
  mech_plumbing_visible: "mechanical",
  kit_sink_plumbing: "mechanical",
  kit_ventilation: "mechanical",
  bath_toilet: "mechanical",
  bath_sink_vanity: "mechanical",
  bath_tub_shower: "mechanical",
  bath_ventilation: "mechanical",
  ext_siding_paint: "paint_finish",
  int_ceiling_walls: "paint_finish",
  int_floors: "paint_finish",
  int_windows_interior: "paint_finish",
  int_doors_hardware: "paint_finish",
  kit_cabinets_counters: "paint_finish",
  bath_caulk_grout: "paint_finish",
  ext_foundation_visible: "monitor",
  ext_driveway_walkway: "monitor",
  ext_landscaping_drainage: "monitor",
  int_smoke_co_detectors: "monitor",
  attic_insulation: "monitor",
  attic_ventilation: "monitor",
  attic_structure: "monitor",
};

const SECTION_LOCATION_LABELS: Record<string, string> = {
  Exterior: "Exterior",
  "Interior — Living Areas": "Living Areas",
  Kitchen: "Kitchen",
  Bathrooms: "Bathrooms",
  "Basement / Utility / Mechanical": "Basement / Utility",
  "Attic / Upper Areas": "Attic / Upper Areas",
};

export interface VaultSuggestionDraft {
  category: VaultCategory;
  name: string;
  location: string | null;
  notes: string | null;
}

function inferVaultCategory(item: Pick<VisitChecklistItem, "item_key" | "label" | "section">): VaultCategory {
  const exactMatch = ITEM_KEY_CATEGORY_OVERRIDES[item.item_key];
  if (exactMatch) return exactMatch;

  const haystack = `${item.section} ${item.label} ${item.item_key}`.toLowerCase();
  if (haystack.includes("appliance")) return "appliance";
  if (/(paint|caulk|grout|cabinet|counter|floor|wall|ceiling|siding|window|door|trim|finish)/.test(haystack)) {
    return "paint_finish";
  }
  if (/(hvac|heater|electrical|plumbing|toilet|sink|shower|tub|ventilation|hood|detector|gutter)/.test(haystack)) {
    return "mechanical";
  }
  if (/(foundation|driveway|walkway|landscaping|drainage|insulation|structure|roof)/.test(haystack)) {
    return "monitor";
  }
  return "other";
}

export function shouldSuggestVaultItem(disposition: ChecklistDisposition | null | undefined): boolean {
  return disposition ? SUGGESTED_DISPOSITIONS.has(disposition) : false;
}

export function buildVaultSuggestion(
  item: Pick<VisitChecklistItem, "section" | "item_key" | "label" | "note">
): VaultSuggestionDraft {
  const noteLines = [`Suggested from ${item.section} checklist: ${item.label}.`];
  const trimmedNote = item.note?.trim();
  if (trimmedNote) noteLines.push(`Finding: ${trimmedNote}`);

  return {
    category: inferVaultCategory(item),
    name: item.label,
    location: SECTION_LOCATION_LABELS[item.section] ?? null,
    notes: noteLines.join("\n"),
  };
}
