// Job type material suggestions — typical materials/consumables needed per job type.
// Used to pre-fill estimate line items, suggest parts during visits, and track expected vs actual usage.

export interface MaterialSuggestion {
  name: string;
  category: string;
  typicalQty: number;
  unit: string;
  notes?: string;
}

export type JobTypeMaterials = Record<string, MaterialSuggestion[]>;

export const JOB_TYPE_MATERIALS: JobTypeMaterials = {
  // ─── Plumbing ───────────────────────────────────────────────────────
  plumbing: [
    { name: "Teflon tape (PTFE)", category: "consumable", typicalQty: 1, unit: "roll", notes: "For threaded connections" },
    { name: "Pipe joint compound", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Plumber's putty", category: "consumable", typicalQty: 1, unit: "tub" },
    { name: "Silicone caulk", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Tubing / pipe (assorted)", category: "supply", typicalQty: 10, unit: "ft" },
    { name: "SharkBite push-fit fittings", category: "supply", typicalQty: 2, unit: "ea", notes: "Quick repairs, various sizes" },
    { name: "Compression fittings", category: "supply", typicalQty: 2, unit: "ea" },
    { name: "Copper fittings (elbows/tees/couplings)", category: "supply", typicalQty: 4, unit: "ea" },
    { name: "PVC fittings", category: "supply", typicalQty: 2, unit: "ea" },
    { name: "PVC primer & cement", category: "consumable", typicalQty: 1, unit: "set" },
    { name: "Braided supply lines (12\"–20\")", category: "supply", typicalQty: 2, unit: "ea" },
    { name: "Shutoff valve (1/4-turn)", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "O-rings / washers (assorted)", category: "supply", typicalQty: 1, unit: "pack" },
    { name: "Plumber's tape (pink/water-grade)", category: "consumable", typicalQty: 1, unit: "roll" },
  ],

  // ─── Toilet Repair / Replacement ───────────────────────────────────
  toilet_repair: [
    { name: "Wax ring with flange", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Toilet fill valve", category: "supply", typicalQty: 1, unit: "ea", notes: "Fluidmaster universal" },
    { name: "Toilet flapper (2\" or 3\")", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Tank-to-bowl bolts & gasket", category: "supply", typicalQty: 1, unit: "set" },
    { name: "Water supply line", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Shutoff valve", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Toilet seat", category: "supply", typicalQty: 1, unit: "ea", notes: "If damaged" },
    { name: "Flush handle / lever", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Teflon tape", category: "consumable", typicalQty: 1, unit: "roll" },
    { name: "Silicone caulk (toilet base)", category: "consumable", typicalQty: 1, unit: "tube" },
  ],

  // ─── Faucet Repair / Replacement ───────────────────────────────────
  faucet_repair: [
    { name: "Faucet cartridge", category: "supply", typicalQty: 1, unit: "ea", notes: "Brand-specific" },
    { name: "O-ring kit (assorted)", category: "supply", typicalQty: 1, unit: "pack" },
    { name: "Washer kit (assorted)", category: "supply", typicalQty: 1, unit: "pack" },
    { name: "Braided supply lines", category: "supply", typicalQty: 2, unit: "ea" },
    { name: "Plumber's grease (silicone)", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Plumber's putty", category: "consumable", typicalQty: 1, unit: "tub" },
    { name: "Teflon tape", category: "consumable", typicalQty: 1, unit: "roll" },
    { name: "Aerator", category: "supply", typicalQty: 1, unit: "ea", notes: "If flow issue" },
    { name: "Silicone caulk", category: "consumable", typicalQty: 1, unit: "tube" },
  ],

  // ─── Drain / Clog Clearing ─────────────────────────────────────────
  drain_clearing: [
    { name: "Drain snake / auger cable", category: "consumable", typicalQty: 1, unit: "ea", notes: "Replace if damaged" },
    { name: "Enzyme drain cleaner", category: "consumable", typicalQty: 1, unit: "bottle" },
    { name: "PVC fittings (if pipe repair)", category: "supply", typicalQty: 2, unit: "ea" },
    { name: "PVC primer & cement", category: "consumable", typicalQty: 1, unit: "set" },
    { name: "Pipe joint compound", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Plumber's tape", category: "consumable", typicalQty: 1, unit: "roll" },
    { name: "Rubber gaskets / washers", category: "supply", typicalQty: 2, unit: "ea" },
  ],

  // ─── Electrical ────────────────────────────────────────────────────
  electrical: [
    { name: "Wire nuts (assorted)", category: "supply", typicalQty: 10, unit: "ea" },
    { name: "Electrical tape", category: "consumable", typicalQty: 1, unit: "roll" },
    { name: "Romex wire (14/2 or 12/2)", category: "supply", typicalQty: 25, unit: "ft" },
    { name: "Junction box", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Wire staples / clamps", category: "supply", typicalQty: 10, unit: "ea" },
    { name: "Outlet / receptacle", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Switch (single-pole / 3-way)", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Wall plate", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Circuit breaker", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Conduit / connectors", category: "supply", typicalQty: 5, unit: "ft" },
    { name: "Cable ties / zip ties", category: "consumable", typicalQty: 10, unit: "ea" },
    { name: "Voltage tester batteries", category: "consumable", typicalQty: 1, unit: "pack" },
  ],

  // ─── HVAC ──────────────────────────────────────────────────────────
  hvac: [
    { name: "Refrigerant line insulation", category: "supply", typicalQty: 10, unit: "ft" },
    { name: "Copper tubing (line set)", category: "supply", typicalQty: 1, unit: "set", notes: "If replacing" },
    { name: "PVC pipe & fittings (condensate drain)", category: "supply", typicalQty: 5, unit: "ft" },
    { name: "PVC primer & cement", category: "consumable", typicalQty: 1, unit: "set" },
    { name: "Foil tape (HVAC-rated)", category: "consumable", typicalQty: 1, unit: "roll" },
    { name: "Duct sealant / mastic", category: "consumable", typicalQty: 1, unit: "tub" },
    { name: "Sheet metal screws", category: "supply", typicalQty: 20, unit: "ea" },
    { name: "Thermostat wire", category: "supply", typicalQty: 25, unit: "ft" },
    { name: "Wire nuts (assorted)", category: "supply", typicalQty: 10, unit: "ea" },
    { name: "Disconnect switch / fuse", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Capacitor", category: "supply", typicalQty: 1, unit: "ea", notes: "If compressor issue" },
    { name: "Air filter", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Condensate treatment tablets", category: "consumable", typicalQty: 1, unit: "pack" },
    { name: "Anti-vibration pads", category: "supply", typicalQty: 4, unit: "ea" },
    { name: "Brazing rods", category: "consumable", typicalQty: 1, unit: "pack" },
    { name: "Refrigerant (R-410A)", category: "consumable", typicalQty: 1, unit: "lb", notes: "If recharging" },
  ],

  // ─── Carpentry / Woodwork ──────────────────────────────────────────
  carpentry: [
    { name: "Wood screws (assorted)", category: "supply", typicalQty: 1, unit: "box" },
    { name: "Deck screws", category: "supply", typicalQty: 1, unit: "box" },
    { name: "Wood glue", category: "consumable", typicalQty: 1, unit: "bottle" },
    { name: "Wood filler", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Sandpaper (assorted grits)", category: "consumable", typicalQty: 1, unit: "pack" },
    { name: "Lumber / boards (varies)", category: "supply", typicalQty: 1, unit: "ea", notes: "Job-dependent" },
    { name: "Plywood / sheathing", category: "supply", typicalQty: 1, unit: "sheet" },
    { name: "Trim / molding", category: "supply", typicalQty: 1, unit: "ea", notes: "Linear ft" },
    { name: "Finish nails (brad nails)", category: "supply", typicalQty: 1, unit: "box" },
    { name: "Shims (wood/plastic)", category: "supply", typicalQty: 1, unit: "pack" },
    { name: "Caulk (paintable)", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Anchor bolts / wall anchors", category: "supply", typicalQty: 4, unit: "ea" },
    { name: "Hinges", category: "supply", typicalQty: 2, unit: "ea" },
    { name: "Door knobs / handles", category: "supply", typicalQty: 1, unit: "ea" },
  ],

  // ─── Painting ──────────────────────────────────────────────────────
  painting: [
    { name: "Interior paint (1 gal)", category: "supply", typicalQty: 1, unit: "gal", notes: "≈350 sq ft/gal" },
    { name: "Primer (1 gal)", category: "supply", typicalQty: 1, unit: "gal" },
    { name: "Paint rollers (pack)", category: "consumable", typicalQty: 1, unit: "pack" },
    { name: "Roller covers (assorted nap)", category: "consumable", typicalQty: 3, unit: "ea" },
    { name: "Paint brushes (2\" & 3\")", category: "consumable", typicalQty: 2, unit: "ea" },
    { name: "Painter's tape", category: "consumable", typicalQty: 1, unit: "roll" },
    { name: "Drop cloths", category: "consumable", typicalQty: 2, unit: "ea" },
    { name: "Spackling compound", category: "consumable", typicalQty: 1, unit: "tub" },
    { name: "Sandpaper / sanding sponge", category: "consumable", typicalQty: 1, unit: "pack" },
    { name: "Tack cloth", category: "consumable", typicalQty: 1, unit: "pack" },
    { name: "Caulk (paintable)", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Plastic sheeting", category: "consumable", typicalQty: 1, unit: "roll" },
    { name: "Paint tray & liner", category: "consumable", typicalQty: 1, unit: "set" },
  ],

  // ─── Roofing ───────────────────────────────────────────────────────
  roofing: [
    { name: "Asphalt shingles (bundle)", category: "supply", typicalQty: 1, unit: "bundle", notes: "≈33 sq ft/bundle" },
    { name: "Roofing nails", category: "supply", typicalQty: 1, unit: "lb" },
    { name: "Roofing felt / underlayment", category: "supply", typicalQty: 1, unit: "roll" },
    { name: "Drip edge flashing", category: "supply", typicalQty: 10, unit: "ft" },
    { name: "Ice & water shield", category: "supply", typicalQty: 1, unit: "roll", notes: "For eaves/valleys" },
    { name: "Ridge cap shingles", category: "supply", typicalQty: 1, unit: "pack" },
    { name: "Pipe boot / vent flashing", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Roofing cement / sealant", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Flashing (step/counter)", category: "supply", typicalQty: 1, unit: "ea", notes: "If wall intersection" },
    { name: "Gutter sealant", category: "consumable", typicalQty: 1, unit: "tube" },
  ],

  // ─── Flooring ──────────────────────────────────────────────────────
  flooring: [
    { name: "Flooring material (tile/wood/vinyl)", category: "supply", typicalQty: 1, unit: "sq ft", notes: "Add 10% waste" },
    { name: "Underlayment", category: "supply", typicalQty: 1, unit: "roll" },
    { name: "Thinset mortar (tile)", category: "supply", typicalQty: 1, unit: "bag" },
    { name: "Grout (tile)", category: "supply", typicalQty: 1, unit: "bag" },
    { name: "Tile spacers", category: "consumable", typicalQty: 1, unit: "pack" },
    { name: "Transition strip", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Quarter-round / base shoe", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Adhesive / flooring glue", category: "consumable", typicalQty: 1, unit: "gal" },
    { name: "Vapor barrier", category: "supply", typicalQty: 1, unit: "roll", notes: "Concrete subfloor" },
    { name: "Caulk (color-matched)", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Trim / baseboard", category: "supply", typicalQty: 1, unit: "ea", notes: "If replacing" },
  ],

  // ─── Windows & Doors ───────────────────────────────────────────────
  windows_doors: [
    { name: "Window / door unit", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Expanding foam insulation", category: "consumable", typicalQty: 1, unit: "can" },
    { name: "Shims (wood/plastic)", category: "supply", typicalQty: 1, unit: "pack" },
    { name: "Exterior caulk", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Flashing tape", category: "consumable", typicalQty: 1, unit: "roll" },
    { name: "Screws (exterior/deck)", category: "supply", typicalQty: 10, unit: "ea" },
    { name: "Weatherstripping", category: "supply", typicalQty: 1, unit: "roll" },
    { name: "Threshold / door sweep", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Trim / casing", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Paint / stain (touch-up)", category: "supply", typicalQty: 1, unit: "qt" },
  ],

  // ─── Appliances ────────────────────────────────────────────────────
  appliances: [
    { name: "Water supply line", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Drain hose", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Gas line connector", category: "supply", typicalQty: 1, unit: "ea", notes: "Gas appliances only" },
    { name: "Teflon tape", category: "consumable", typicalQty: 1, unit: "roll" },
    { name: "Pipe joint compound", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Appliance cord / power cord", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Vent hose (dryer)", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Drip pan", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Leveling feet / pads", category: "supply", typicalQty: 4, unit: "ea" },
    { name: "Silicone caulk", category: "consumable", typicalQty: 1, unit: "tube" },
  ],

  // ─── Drywall ───────────────────────────────────────────────────────
  drywall: [
    { name: "Drywall sheet (4x8)", category: "supply", typicalQty: 1, unit: "sheet" },
    { name: "Joint compound (mud)", category: "consumable", typicalQty: 1, unit: "gal" },
    { name: "Drywall tape (paper/mesh)", category: "consumable", typicalQty: 1, unit: "roll" },
    { name: "Drywall screws", category: "supply", typicalQty: 1, unit: "box" },
    { name: "Corner bead", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Sandpaper / sanding sponge", category: "consumable", typicalQty: 1, unit: "pack" },
    { name: "Primer (drywall sealer)", category: "supply", typicalQty: 1, unit: "gal" },
    { name: "Drywall patches (small)", category: "supply", typicalQty: 1, unit: "pack", notes: "For holes" },
    { name: "Furring strips / wood backing", category: "supply", typicalQty: 2, unit: "ea" },
  ],

  // ─── Landscaping / Exterior ────────────────────────────────────────
  landscaping: [
    { name: "Mulch", category: "supply", typicalQty: 1, unit: "bag" },
    { name: "Topsoil", category: "supply", typicalQty: 1, unit: "bag" },
    { name: "Plants / sod", category: "supply", typicalQty: 1, unit: "ea", notes: "Job-dependent" },
    { name: "Sprinkler heads", category: "supply", typicalQty: 2, unit: "ea" },
    { name: "PVC pipe (irrigation)", category: "supply", typicalQty: 10, unit: "ft" },
    { name: "PVC fittings (irrigation)", category: "supply", typicalQty: 4, unit: "ea" },
    { name: "Landscape fabric", category: "supply", typicalQty: 1, unit: "roll" },
    { name: "Edging material", category: "supply", typicalQty: 10, unit: "ft" },
    { name: "Fertilizer", category: "consumable", typicalQty: 1, unit: "bag" },
    { name: "Stakes / ties", category: "supply", typicalQty: 10, unit: "ea" },
    { name: "Outdoor sealant", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Pavers / stones", category: "supply", typicalQty: 1, unit: "ea", notes: "If hardscaping" },
  ],

  // ─── Home Maintenance (Walkthrough) ────────────────────────────────
  maintenance: [
    { name: "HVAC air filter", category: "supply", typicalQty: 1, unit: "ea" },
    { name: "Teflon tape", category: "consumable", typicalQty: 1, unit: "roll" },
    { name: "Silicone caulk", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Touch-up paint", category: "supply", typicalQty: 1, unit: "qt" },
    { name: "Lubricant (WD-40 / silicone spray)", category: "consumable", typicalQty: 1, unit: "can" },
    { name: "Light bulbs", category: "supply", typicalQty: 2, unit: "ea" },
    { name: "Smoke detector batteries", category: "supply", typicalQty: 2, unit: "ea" },
    { name: "Weatherstripping", category: "supply", typicalQty: 1, unit: "roll" },
    { name: "Gutter sealant", category: "consumable", typicalQty: 1, unit: "tube" },
    { name: "Screen patches / spline", category: "supply", typicalQty: 1, unit: "pack" },
  ],

  // ─── Other / Custom ────────────────────────────────────────────────
  custom: [],
};

// Group materials by category for display
export function getMaterialsByCategory(jobType: string): Record<string, MaterialSuggestion[]> {
  const materials = JOB_TYPE_MATERIALS[jobType] || [];
  return materials.reduce<Record<string, MaterialSuggestion[]>>((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {});
}

// Get all materials for a job type as a flat list
export function getMaterialsForJobType(jobType: string): MaterialSuggestion[] {
  return JOB_TYPE_MATERIALS[jobType] || [];
}

// Get all job types that have material suggestions
export function getJobTypesWithMaterials(): string[] {
  return Object.keys(JOB_TYPE_MATERIALS).filter(
    (key) => JOB_TYPE_MATERIALS[key].length > 0
  );
}
