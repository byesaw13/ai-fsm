import type {
  HybridEstimateCalculation,
  HybridLineItemResult,
  HybridPricingItemRequest,
  Layer3HistoricalActualsCalibration,
} from "./types";
import { findLayer1Benchmark } from "./standards-catalog";
import { getLayer2MaterialCost } from "./distributor-catalog";

export const DOVETAILS_DEFAULT_CALIBRATION: Layer3HistoricalActualsCalibration = {
  overallSignedBiasPct: -0.9, // From TASK-095 postgresql benchmark run
  tradeCalibrationMultipliers: {
    carpentry: 1.02,
    electrical: 0.98,
    painting: 1.00,
    plumbing: 1.00,
    drywall: 1.00,
  },
  confidenceScorePct: 92,
};

export function computeHybridEstimateItem(
  req: HybridPricingItemRequest,
  calibration: Layer3HistoricalActualsCalibration = DOVETAILS_DEFAULT_CALIBRATION,
  burdenedRateCents: number = 8500 // $85/hr Dovetails burdened labor rate
): HybridLineItemResult {
  const benchmark = findLayer1Benchmark(req.codeOrDescription);
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
  const breakdownSummary = `Layer 1: ${calibratedHours} hrs (${benchmark.csiCode} benchmark) | Layer 2: $${(
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
    localCalibrationMultiplier: calibration.tradeCalibrationMultipliers.carpentry ?? 1.02,
    subtotalCents,
    grandTotalCents,
    transparencyNotes,
  };
}
