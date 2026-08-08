import type { TradeConstructionProfile } from "./types";

export const ELECTRICAL_CONSTRUCTION_PROFILE: TradeConstructionProfile = {
  tradeKey: "electrical",
  displayName: "Electrical & Lighting",
  buildingCodeNotes: [
    "NEC 314.27: Standard octagonal ceiling boxes are rated for 35 lbs max. Fixtures >35 lbs require a heavy-duty fan/fixture brace box anchored directly to joists.",
    "20ft foyer ceilings require a 16'-24' tall A-frame ladder or interior scaffolding + 2-man safety crew mobilization.",
  ],
  standardSteps: [
    {
      phase: "prep",
      name: "Floor Protection & Tall Access Setup",
      description: "Lay canvas drop cloths over foyer flooring. Stage 16'-24' tall multi-position A-frame ladder with stabilizer feet.",
      isInspection: false,
    },
    {
      phase: "demo_inspection",
      name: "Power Lockout & Box Weight Inspection",
      description: "Verify circuit lock-out with non-contact voltage tester. Inspect existing junction box weight rating and structural anchoring.",
      isInspection: true,
      concealedRiskFlag: "UNBRACED_CEILING_BOX_RISK",
    },
    {
      phase: "substrate_framing",
      name: "Junction Box Brace Upgrade (if required)",
      description: "If fixture exceeds box rating, install heavy-duty expanding ceiling joist brace box.",
      isInspection: false,
    },
    {
      phase: "installation",
      name: "Chandelier Assembly & Mounting",
      description: "Assemble fixture arms/crystals. Wire conductors with lever wire connectors (WAGO) or wire nuts and mount canopy securely to threaded stem.",
      isInspection: false,
    },
    {
      phase: "testing_finish",
      name: "Bulb Installation & Circuit Test",
      description: "Install LED bulbs, restore power, test switch/dimmer operation and verify physical level.",
      isInspection: false,
    },
  ],
  concealedRisks: [
    {
      triggerKeywords: ["chandelier", "light", "fixture", "foyer", "pendant"],
      riskName: "Unbraced Ceiling Box / Heavy Fixture",
      inspectionStep: "Inspect ceiling box mounting rating prior to hanging new fixture.",
      changeOrderDisclaimer: "If existing ceiling junction box is unbraced or inadequate for fixture weight (>35 lbs), upgrading to a heavy-duty joist brace box will be quoted under an authorized Change Order ($145 labor + materials).",
      estimatedLaborAddHrsOnFailure: 1.5,
    },
  ],
  requiredHardware: [
    {
      triggerKeywords: ["chandelier", "light", "fixture", "ceiling fan"],
      category: "electrical",
      productName: "Heavy-Duty Ceiling Fan & Fixture Brace Box (50 lb rated)",
      unit: "each",
      reasoning: "NEC code-compliant joist brace box required for heavy fixtures and chandeliers.",
      estUnitCostCents: 2450,
    },
    {
      triggerKeywords: ["chandelier", "light", "fixture"],
      category: "electrical",
      productName: "WAGO 221 Lever-Nut Wire Connectors (Assorted Pack)",
      unit: "box",
      reasoning: "Secure, vibration-resistant wire terminations for high-ceiling fixture canopy wiring.",
      estUnitCostCents: 1850,
    },
    {
      triggerKeywords: ["foyer", "20", "high ceiling", "vaulted"],
      category: "protection",
      productName: "Heavy Canvas Drop Cloth 9x12 ft",
      unit: "piece",
      reasoning: "Surface protection for foyer hardwood/tile floors during tall ladder staging.",
      estUnitCostCents: 3200,
    },
  ],
};
