export interface IntakeQuestion {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export const INTAKE_QUESTIONS: Record<string, IntakeQuestion[]> = {
  painting_finishes: [
    {
      key: "surface",
      label: "Interior or exterior?",
      options: [
        { value: "interior", label: "Interior" },
        { value: "exterior", label: "Exterior" },
        { value: "both", label: "Both" },
      ],
    },
    {
      key: "room_count",
      label: "How many rooms / areas?",
      options: [
        { value: "1", label: "1 room" },
        { value: "2-3", label: "2–3 rooms" },
        { value: "4+", label: "4+ rooms" },
      ],
    },
  ],
  general_repairs: [
    {
      key: "repair_type",
      label: "What type of repair?",
      options: [
        { value: "drywall", label: "Drywall / patching" },
        { value: "door_window", label: "Door or window" },
        { value: "floor_trim", label: "Floor or trim" },
        { value: "other", label: "Other / not sure" },
      ],
    },
    {
      key: "structural_concern",
      label: "Any structural concern?",
      options: [
        { value: "cosmetic", label: "Cosmetic only" },
        { value: "unsure", label: "Not sure" },
        { value: "structural", label: "Possibly structural" },
      ],
    },
  ],
  plumbing: [
    {
      key: "issue_type",
      label: "What type of issue?",
      options: [
        { value: "dripping_faucet", label: "Dripping faucet / fixture" },
        { value: "running_toilet", label: "Running toilet" },
        { value: "leak", label: "Active leak" },
        { value: "clog", label: "Clog or slow drain" },
        { value: "new_install", label: "New install / replacement" },
        { value: "other", label: "Other" },
      ],
    },
  ],
  electrical: [
    {
      key: "electrical_type",
      label: "What type of work?",
      options: [
        { value: "outlet_switch", label: "Outlet or switch" },
        { value: "fixture_fan", label: "Fixture or ceiling fan" },
        { value: "panel", label: "Panel / breaker" },
        { value: "other", label: "Other" },
      ],
    },
    {
      key: "safety_concern",
      label: "Any safety concerns?",
      options: [
        { value: "none", label: "None" },
        { value: "tripping_breakers", label: "Tripping breakers" },
        { value: "sparks_smell", label: "Sparks or burning smell" },
      ],
    },
  ],
  carpentry_furniture: [
    {
      key: "carpentry_type",
      label: "Custom build or repair?",
      options: [
        { value: "custom_build", label: "Custom build" },
        { value: "repair", label: "Repair existing" },
        { value: "install", label: "Install / assemble" },
      ],
    },
  ],
  outdoor_seasonal: [
    {
      key: "outdoor_type",
      label: "What type of work?",
      options: [
        { value: "lawn_landscaping", label: "Lawn or landscaping" },
        { value: "pressure_wash", label: "Pressure washing" },
        { value: "gutter_roof", label: "Gutter or roof" },
        { value: "fence_deck", label: "Fence or deck" },
        { value: "other", label: "Other" },
      ],
    },
  ],
  mounting_installs: [
    {
      key: "mount_type",
      label: "What are you mounting?",
      options: [
        { value: "tv_monitor", label: "TV or monitor" },
        { value: "shelf_artwork", label: "Shelf, artwork, or mirror" },
        { value: "blinds_curtains", label: "Blinds or curtain rods" },
        { value: "other", label: "Other" },
      ],
    },
  ],
  maintenance_small: [
    {
      key: "maintenance_type",
      label: "What needs attention?",
      options: [
        { value: "fan_fixture", label: "Fan or light fixture" },
        { value: "faucet_disposal", label: "Faucet or disposal" },
        { value: "lock_hardware", label: "Lock or door hardware" },
        { value: "other", label: "Other / multiple items" },
      ],
    },
  ],
  specialty_expansion: [
    {
      key: "project_type",
      label: "Project type?",
      options: [
        { value: "addition", label: "Room addition" },
        { value: "conversion", label: "Space conversion" },
        { value: "major_renovation", label: "Major renovation" },
        { value: "other", label: "Other" },
      ],
    },
  ],
};

export const INTAKE_METADATA_LABELS: Record<string, Record<string, string>> = {
  surface: { interior: "Interior", exterior: "Exterior", both: "Interior & Exterior" },
  room_count: { "1": "1 room", "2-3": "2–3 rooms", "4+": "4+ rooms" },
  repair_type: { drywall: "Drywall / patching", door_window: "Door or window", floor_trim: "Floor or trim", other: "Other / not sure" },
  structural_concern: { cosmetic: "Cosmetic only", unsure: "Not sure", structural: "Possibly structural" },
  issue_type: { dripping_faucet: "Dripping faucet", running_toilet: "Running toilet", leak: "Active leak", clog: "Clog / slow drain", new_install: "New install", other: "Other" },
  electrical_type: { outlet_switch: "Outlet or switch", fixture_fan: "Fixture or fan", panel: "Panel / breaker", other: "Other" },
  safety_concern: { none: "None", tripping_breakers: "Tripping breakers", sparks_smell: "Sparks or burning smell" },
  carpentry_type: { custom_build: "Custom build", repair: "Repair existing", install: "Install / assemble" },
  outdoor_type: { lawn_landscaping: "Lawn or landscaping", pressure_wash: "Pressure washing", gutter_roof: "Gutter or roof", fence_deck: "Fence or deck", other: "Other" },
  mount_type: { tv_monitor: "TV or monitor", shelf_artwork: "Shelf / artwork / mirror", blinds_curtains: "Blinds or curtain rods", other: "Other" },
  maintenance_type: { fan_fixture: "Fan or fixture", faucet_disposal: "Faucet or disposal", lock_hardware: "Lock or hardware", other: "Other" },
  project_type: { addition: "Room addition", conversion: "Space conversion", major_renovation: "Major renovation", other: "Other" },
};
