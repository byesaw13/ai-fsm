import type { TradeConstructionProfile } from "./types";

export const PLUMBING_CONSTRUCTION_PROFILE: TradeConstructionProfile = {
  tradeKey: "plumbing",
  displayName: "Plumbing Fixtures",
  buildingCodeNotes: [
    "Verify main shutoff valve location before disconnecting supply lines.",
    "Replace braided stainless steel supply lines on every fixture swap.",
  ],
  standardSteps: [
    {
      phase: "prep",
      name: "Water Shutoff & Basin Setup",
      description: "Shut off angle stops or main water supply. Place drip bucket and towels under connection.",
      isInspection: false,
    },
    {
      phase: "demo_inspection",
      name: "Shutoff Valve & Flange Inspection",
      description: "Inspect angle stops for corrosion/seizure and toilet flange for cracks or subfloor decay.",
      isInspection: true,
      concealedRiskFlag: "CORRODED_VALVE_FLANGE_RISK",
    },
    {
      phase: "installation",
      name: "Fixture Installation & Connections",
      description: "Mount new fixture, install fresh wax ring/gaskets, connect braided stainless steel supply lines.",
      isInspection: false,
    },
    {
      phase: "testing_finish",
      name: "Pressure Test & Leak Checks",
      description: "Restore water pressure, run continuous water test for 5 minutes, inspect all compression joints with dry paper towel.",
      isInspection: false,
    },
  ],
  concealedRisks: [
    {
      triggerKeywords: ["faucet", "toilet", "vanity", "sink", "disposal"],
      riskName: "Corroded Shutoff Valves / Broken Toilet Flange",
      inspectionStep: "Test shutoff valve operation and check flange integrity upon removal.",
      changeOrderDisclaimer: "If existing shutoff valves fail to close or toilet flange is rusted/broken, valve/flange replacement will be quoted under an authorized Change Order ($95 + parts).",
      estimatedLaborAddHrsOnFailure: 1.5,
    },
  ],
  requiredHardware: [
    {
      triggerKeywords: ["faucet", "toilet", "sink"],
      category: "hardware",
      productName: "Braided Stainless Steel Water Supply Lines (1/2 in x 3/8 in, Pair)",
      unit: "pair",
      reasoning: "Fresh supply lines required on all fixture replacements to prevent burst line leaks.",
      estUnitCostCents: 1850,
    },
  ],
};
