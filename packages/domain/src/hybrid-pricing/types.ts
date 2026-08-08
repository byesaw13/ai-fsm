export interface Layer1StandardBenchmark {
  tradeCategory: "carpentry" | "electrical" | "painting" | "plumbing" | "drywall";
  csiCode: string;
  itemCode: string;
  description: string;
  unit: "LF" | "sqft" | "each" | "door" | "window";
  standardLaborHoursPerUnit: number;
  setupLaborHours: number;
  heightModifier16to20ft: number;
  oldHouseRiskModifier: number;
}

export interface Layer2DistributorCatalogItem {
  sku: string;
  brand: string;
  name: string;
  category: "lumber" | "trim" | "fasteners" | "sealants" | "electrical" | "sheet_goods" | "paint" | "hardware";
  unitCostCents: number;
  packQuantity: number;
  unitOfMeasure: string;
  supplier: "Home Depot" | "Lowe's" | "Supply House" | "Azek";
  isFastenerOrConsumableKit?: boolean;
}

export interface Layer3HistoricalActualsCalibration {
  overallSignedBiasPct: number;    // e.g. -0.9% from TASK-095
  tradeCalibrationMultipliers: Record<string, number>; // e.g. { carpentry: 1.02, electrical: 0.98 }
  confidenceScorePct: number;      // e.g. 92%
}

export interface HybridPricingItemRequest {
  codeOrDescription: string;
  quantity: number;
  isHighCeiling20ft?: boolean;
  isOldHouse?: boolean;
  isPvcMaterial?: boolean;
}

export interface HybridLineItemResult {
  description: string;
  quantity: number;
  unit: string;
  layer1BaseLaborHours: number;
  layer1AdjustedLaborHours: number;
  laborCostCents: number;
  layer2MaterialCostCents: number;
  layer2ConsumablesCostCents: number;
  layer3LocalCalibrationFactor: number;
  finalLineTotalCents: number;
  breakdownSummary: string;
  /**
   * True when no Layer 1 catalog entry matched the requested item and this
   * line fell back to a generic labor-hour estimate — never silent (see
   * UnmatchedBenchmarkError in standards-catalog.ts). The estimate UI must
   * surface this so the founder verifies the line manually rather than
   * trusting an unrelated trade's benchmark.
   */
  layer1Unmatched?: boolean;
}

export interface HybridEstimateCalculation {
  lineItems: HybridLineItemResult[];
  totalLaborHours: number;
  totalLaborCostCents: number;
  totalMaterialCostCents: number;
  totalConsumablesCostCents: number;
  localCalibrationMultiplier: number;
  subtotalCents: number;
  grandTotalCents: number;
  transparencyNotes: string[];
}
