import type {
  HybridEstimateCalculation,
  HybridLineItemResult,
  HybridPricingItemRequest,
  Layer3HistoricalActualsCalibration,
} from "./types";
import { findLayer1Benchmark, UnmatchedBenchmarkError } from "./standards-catalog";
import { getLayer2MaterialCost } from "./distributor-catalog";
import type { Layer1StandardBenchmark } from "./types";

// Generic, deliberately conservative placeholder used ONLY when nothing in
// the catalog matches — never presented as a real trade benchmark. Flagged
// via HybridLineItemResult.layer1Unmatched so the UI warns the founder to
// verify the line manually instead of trusting it silently.
const GENERIC_UNMATCHED_BENCHMARK: Layer1StandardBenchmark = {
  tradeCategory: "carpentry",
  csiCode: "00 00 00.00",
  itemCode: "UNMATCHED.GENERIC",
  description: "Unmatched item — generic estimate, verify manually",
  unit: "each",
  standardLaborHoursPerUnit: 1.0,
  setupLaborHours: 0.5,
  heightModifier16to20ft: 1.25,
  oldHouseRiskModifier: 1.20,
};

// Neutral by design (CEO review, PR #589): the TASK-095 benchmark report
// this was originally seeded from ("Clean Samples: 1" for labor) does not
// support trade-specific multipliers or a 92% confidence claim — one job
// is not a calibration. Multipliers stay at 1.00 (no adjustment) and
// confidence reflects the real sample size until run-estimate-benchmark.ts
// accumulates enough clean samples per trade to justify a real number.
export const DOVETAILS_DEFAULT_CALIBRATION: Layer3HistoricalActualsCalibration = {
  overallSignedBiasPct: 0,
  tradeCalibrationMultipliers: {
    carpentry: 1.00,
    electrical: 1.00,
    painting: 1.00,
    plumbing: 1.00,
    drywall: 1.00,
  },
  confidenceScorePct: 0, // no real calibration data yet — see TASK-095
};

export function computeHybridEstimateItem(
  req: HybridPricingItemRequest,
  calibration: Layer3HistoricalActualsCalibration = DOVETAILS_DEFAULT_CALIBRATION,
  burdenedRateCents: number = 8500 // $85/hr Dovetails burdened labor rate
): HybridLineItemResult {
  let benchmark: Layer1StandardBenchmark;
  let layer1Unmatched = false;
  try {
    benchmark = findLayer1Benchmark(req.codeOrDescription);
  } catch (err) {
    if (!(err instanceof UnmatchedBenchmarkError)) throw err;
    benchmark = GENERIC_UNMATCHED_BENCHMARK;
    layer1Unmatched = true;
  }
  const rawHours = benchmark.setupLaborHours + req.quantity * benchmark.standardLaborHoursPerUnit;

  let heightMult = 1.0;
  if (req.isHighCeiling20ft) {
    heightMult = benchmark.heightModifier16to20ft;
  }

  let oldHouseMult = 1.0;
  if (req.isOldHouse) {
    oldHouseMult = benchmark.oldHouseRiskModifier;
  }

  const layer1AdjustedLaborHours = Math.round(rawHours * heightMult * oldHouseMult * 100) / 100;

  // Layer 3: Local historical actuals shrinkage calibration multiplier
  const tradeMult = calibration.tradeCalibrationMultipliers[benchmark.tradeCategory] ?? 1.00;
  const calibratedHours = Math.round(layer1AdjustedLaborHours * tradeMult * 100) / 100;
  const laborCostCents = Math.round(calibratedHours * burdenedRateCents);

  // Layer 2: Distributor material + consumables costs
  const { materialCents, consumablesCents, matchedItems } = getLayer2MaterialCost(
    req.codeOrDescription,
    req.quantity
  );

  const finalLineTotalCents = laborCostCents + materialCents + consumablesCents;

  const skuList = matchedItems.map((m) => m.sku).join(", ");
  const breakdownSummary =
    (layer1Unmatched ? "⚠ UNMATCHED — no catalog benchmark found, generic estimate, verify manually | " : "") +
    `Layer 1: ${calibratedHours} hrs (${benchmark.csiCode} benchmark) | Layer 2: $${(
      (materialCents + consumablesCents) /
      100
    ).toFixed(2)} materials (${skuList || "catalog"}) | Layer 3: ${(tradeMult * 100).toFixed(0)}% historical actuals factor`;

  return {
    description: benchmark.description,
    quantity: req.quantity,
    unit: benchmark.unit,
    layer1BaseLaborHours: rawHours,
    layer1AdjustedLaborHours,
    laborCostCents,
    layer2MaterialCostCents: materialCents,
    layer2ConsumablesCostCents: consumablesCents,
    layer3LocalCalibrationFactor: tradeMult,
    finalLineTotalCents,
    breakdownSummary,
    ...(layer1Unmatched ? { layer1Unmatched: true } : {}),
  };
}

export function compute3LayerHybridEstimate(
  requests: HybridPricingItemRequest[],
  calibration: Layer3HistoricalActualsCalibration = DOVETAILS_DEFAULT_CALIBRATION,
  burdenedRateCents: number = 8500
): HybridEstimateCalculation {
  const lineResults = requests.map((req) => computeHybridEstimateItem(req, calibration, burdenedRateCents));

  const totalLaborHours = Math.round(lineResults.reduce((acc, l) => acc + l.layer1AdjustedLaborHours * l.layer3LocalCalibrationFactor, 0) * 100) / 100;
  const totalLaborCostCents = lineResults.reduce((acc, l) => acc + l.laborCostCents, 0);
  const totalMaterialCostCents = lineResults.reduce((acc, l) => acc + l.layer2MaterialCostCents, 0);
  const totalConsumablesCostCents = lineResults.reduce((acc, l) => acc + l.layer2ConsumablesCostCents, 0);

  const subtotalCents = totalLaborCostCents + totalMaterialCostCents + totalConsumablesCostCents;
  const grandTotalCents = subtotalCents;

  const transparencyNotes = [
    `Layer 1 Standard Trade Hours: Derives base labor from CSI/RSMeans trade benchmarks (${totalLaborHours} total hrs).`,
    `Layer 2 Supplier Catalogs: Uses Big-Box/Distributor SKUs + hardware kits ($${((totalMaterialCostCents + totalConsumablesCostCents) / 100).toFixed(2)} total materials/consumables).`,
    `Layer 3 Local Historical Actuals: Calibrated against Dovetails' PostgreSQL job actuals (signed bias: ${calibration.overallSignedBiasPct}%, confidence: ${calibration.confidenceScorePct}%).`,
  ];

  return {
    lineItems: lineResults,
    totalLaborHours,
    totalLaborCostCents,
    totalMaterialCostCents,
    totalConsumablesCostCents,
    localCalibrationMultiplier: calibration.tradeCalibrationMultipliers.carpentry ?? 1.00,
    subtotalCents,
    grandTotalCents,
    transparencyNotes,
  };
}
