import type { TradeConstructionProfile } from "./types";

export const DRYWALL_CONSTRUCTION_PROFILE: TradeConstructionProfile = {
  tradeKey: "drywall",
  displayName: "Drywall & Plaster Repair",
  buildingCodeNotes: [
    "Bathrooms and wet areas require moisture-resistant greenboard or cement backer board.",
    "Dust containment zip-wall poly barrier recommended for occupied homes.",
  ],
  standardSteps: [
    {
      phase: "prep",
      name: "Dust Containment & Floor Masking",
      description: "Set up poly dust barrier containment and cover flooring with heavy drop cloths.",
      isInspection: false,
    },
    {
      phase: "demo_inspection",
      name: "Framing & Electrical Cable Inspection",
      description: "Cut clean square opening, inspect behind wall for electrical wiring, pipes, or framing studs.",
      isInspection: true,
      concealedRiskFlag: "HIDDEN_UTILITY_RISK",
    },
    {
      phase: "substrate_framing",
      name: "Wood Backing & Drywall Patch Mounting",
      description: "Install 1x3 pine backing cleats. Screw new drywall patch flush with existing wall plane.",
      isInspection: false,
    },
    {
      phase: "installation",
      name: "Taping & Multi-Coat Joint Compound",
      description: "Embed fiberglass mesh tape in joint compound. Apply skim coats, feathering edges 8-12 inches out.",
      isInspection: false,
    },
    {
      phase: "testing_finish",
      name: "Dustless Sanding & Prime Coat",
      description: "Sponge sand or vacuum sand flush. Apply PVA drywall primer coat over fresh joint compound.",
      isInspection: false,
    },
  ],
  concealedRisks: [
    {
      triggerKeywords: ["drywall", "hole", "patch", "water damage", "ceiling repair"],
      riskName: "Hidden Electrical Cables or Water Damage Framing",
      inspectionStep: "Inspect wall cavity for wiring/plumbing prior to screw fastening.",
      changeOrderDisclaimer: "If wall cavity reveals hidden plumbing leaks or unbacked framing requiring structural blocking, cavity repairs will be quoted under an authorized Change Order.",
      estimatedLaborAddHrsOnFailure: 1.5,
    },
  ],
  requiredHardware: [
    {
      triggerKeywords: ["drywall", "patch", "sheetrock"],
      category: "sheet_goods",
      productName: "Self-Adhesive Fiberglass Mesh Drywall Joint Tape (300 ft)",
      unit: "roll",
      reasoning: "High-strength crack-resistant tape for patch seams.",
      estUnitCostCents: 1150,
    },
    {
      triggerKeywords: ["drywall", "patch", "sheetrock"],
      category: "sealants",
      productName: "PVA Drywall Primer Sealer (1 Gallon)",
      unit: "gallon",
      reasoning: "PVA sealer required over joint compound to equalize porosity before topcoat painting.",
      estUnitCostCents: 2450,
    },
  ],
};
