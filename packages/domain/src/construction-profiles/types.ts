export type TradeCategory = "carpentry" | "electrical" | "painting" | "plumbing" | "drywall" | "general";

export interface ConstructionStep {
  phase: "prep" | "demo_inspection" | "substrate_framing" | "installation" | "weatherproofing_sealing" | "testing_finish";
  name: string;
  description: string;
  isInspection: boolean;
  concealedRiskFlag?: string;
}

export interface ConcealedRiskRule {
  triggerKeywords: string[];
  riskName: string;
  inspectionStep: string;
  changeOrderDisclaimer: string;
  estimatedLaborAddHrsOnFailure: number;
}

export interface RequiredHardwareRule {
  triggerKeywords: string[];
  category: "fasteners" | "sealants" | "flashing" | "electrical" | "protection" | "hardware" | "sheet_goods" | "paint" | "lumber" | "trim" | "flooring" | "other";
  productName: string;
  unit: string;
  reasoning: string;
  estUnitCostCents: number;
}

export interface TradeConstructionProfile {
  tradeKey: TradeCategory;
  displayName: string;
  standardSteps: ConstructionStep[];
  concealedRisks: ConcealedRiskRule[];
  requiredHardware: RequiredHardwareRule[];
  buildingCodeNotes?: string[];
}
