import type { Layer1StandardBenchmark } from "./types";

export const LAYER1_STANDARDS_CATALOG: Layer1StandardBenchmark[] = [
  {
    tradeCategory: "carpentry",
    csiCode: "06 20 23.10",
    itemCode: "TRIM.GARAGE.PVC",
    description: "Cellular PVC exterior garage door casing and jamb replacement",
    unit: "LF",
    standardLaborHoursPerUnit: 0.075, // ~13.3 LF per hour
    setupLaborHours: 0.75, // demo & prep setup
    heightModifier16to20ft: 1.25,
    oldHouseRiskModifier: 1.20,
  },
  {
    tradeCategory: "carpentry",
    csiCode: "06 20 20.00",
    itemCode: "TRIM.EXTERIOR.WOOD",
    description: "Exterior wood trim casing and brickmould replacement",
    unit: "LF",
    standardLaborHoursPerUnit: 0.065,
    setupLaborHours: 0.5,
    heightModifier16to20ft: 1.30,
    oldHouseRiskModifier: 1.25,
  },
  {
    tradeCategory: "electrical",
    csiCode: "26 51 00.10",
    itemCode: "LIGHTING.CHANDELIER.HANG",
    description: "Hang customer-supplied chandelier or pendant light fixture",
    unit: "each",
    standardLaborHoursPerUnit: 1.50, // 1.5 hrs standard height
    setupLaborHours: 0.50,
    heightModifier16to20ft: 1.35, // 20ft foyer ladder staging
    oldHouseRiskModifier: 1.20,
  },
  {
    tradeCategory: "painting",
    csiCode: "09 91 23.00",
    itemCode: "PAINTING.WALLS.INTERIOR",
    description: "Interior wall painting (two coats acrylic latex)",
    unit: "sqft",
    standardLaborHoursPerUnit: 0.005, // 200 sqft/hr
    setupLaborHours: 1.00, // floor masking & tape
    heightModifier16to20ft: 1.30,
    oldHouseRiskModifier: 1.15,
  },
  {
    tradeCategory: "drywall",
    csiCode: "09 29 00.10",
    itemCode: "DRYWALL.PATCH.SMALL",
    description: "Drywall patch repair (up to 12 in x 12 in) with tape and joint compound",
    unit: "each",
    standardLaborHoursPerUnit: 1.25,
    setupLaborHours: 0.50,
    heightModifier16to20ft: 1.25,
    oldHouseRiskModifier: 1.15,
  },
  {
    tradeCategory: "plumbing",
    csiCode: "22 40 00.10",
    itemCode: "PLUMBING.FAUCET.REPLACE",
    description: "Replace kitchen or lavatory faucet with fresh braided supply lines",
    unit: "each",
    standardLaborHoursPerUnit: 1.35,
    setupLaborHours: 0.40,
    heightModifier16to20ft: 1.00,
    oldHouseRiskModifier: 1.25,
  },
];

/**
 * Thrown when no Layer 1 catalog entry matches. Named so callers can
 * distinguish "nothing matched" from any other failure and decide how to
 * degrade (never silently substitute an unrelated trade's benchmark —
 * that previously happened by falling back to catalog[0] regardless of
 * trade, producing wrong customer-facing prices with no signal it happened).
 */
export class UnmatchedBenchmarkError extends Error {
  constructor(readonly query: string) {
    super(`No Layer 1 standards-catalog entry matches "${query}"`);
    this.name = "UnmatchedBenchmarkError";
  }
}

export function findLayer1Benchmark(codeOrKeyword: string): Layer1StandardBenchmark {
  const query = codeOrKeyword.toLowerCase();
  const match = LAYER1_STANDARDS_CATALOG.find(
    (b) =>
      b.itemCode.toLowerCase() === query ||
      b.description.toLowerCase().includes(query) ||
      query.includes(b.tradeCategory)
  );
  if (!match) throw new UnmatchedBenchmarkError(codeOrKeyword);
  return match;
}
