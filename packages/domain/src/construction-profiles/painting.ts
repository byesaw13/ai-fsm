import type { TradeConstructionProfile } from "./types";

export const PAINTING_CONSTRUCTION_PROFILE: TradeConstructionProfile = {
  tradeKey: "painting",
  displayName: "Interior & Exterior Painting",
  buildingCodeNotes: [
    "Pre-1978 construction requires RRP lead-safe containment checks.",
    "Tannin bleed or stain bleed requires shellac-based primer (Zinsser BIN) prior to topcoat.",
  ],
  standardSteps: [
    {
      phase: "prep",
      name: "Masking & Floor Protection",
      description: "Apply painter's tape, rosin paper, and drop cloths over floors, trim, and hardware.",
      isInspection: false,
    },
    {
      phase: "demo_inspection",
      name: "Substrate & Stain Inspection",
      description: "Inspect wall surfaces for drywall damage, water stains, or nicotine residue.",
      isInspection: true,
      concealedRiskFlag: "WALL_STAIN_STAINING_RISK",
    },
    {
      phase: "substrate_framing",
      name: "Patching & Prime Coat Application",
      description: "Spackle nail holes, sand flush, and apply stain-blocking primer over patches.",
      isInspection: false,
    },
    {
      phase: "installation",
      name: "First & Second Topcoat Application",
      description: "Apply premium acrylic latex paint using 3/8in microfiber roller and professional angle sash brushes.",
      isInspection: false,
    },
    {
      phase: "testing_finish",
      name: "Tape Pull & Touch-Up Inspection",
      description: "Remove tape while wet/tacky, inspect cut-in lines, perform touch-ups, and clean up site.",
      isInspection: false,
    },
  ],
  concealedRisks: [
    {
      triggerKeywords: ["stain", "water damage", "nicotine", "smoke", "dark wall"],
      riskName: "Stain Bleed-Through",
      inspectionStep: "Inspect stain severity; apply shellac primer to prevent topcoat yellowing.",
      changeOrderDisclaimer: "If severe water stains or smoke residue require full-room shellac primer, stain-blocking prep will be quoted under an authorized Change Order.",
      estimatedLaborAddHrsOnFailure: 2.0,
    },
  ],
  requiredHardware: [
    {
      triggerKeywords: ["paint", "repaint", "trim paint"],
      category: "sealants",
      productName: "FrogTape Multi-Surface Painter's Tape (1.88 in)",
      unit: "roll",
      reasoning: "PaintBlock technology tape for crisp cut-in lines along trim and ceilings.",
      estUnitCostCents: 1250,
    },
    {
      triggerKeywords: ["patch", "drywall repair", "hole"],
      category: "sealants",
      productName: "Zinsser BIN Shellac-Based Primer (1 Gallon)",
      unit: "gallon",
      reasoning: "Ultimate stain-blocking primer for water stains, knot holes, and nicotine.",
      estUnitCostCents: 6200,
    },
  ],
};
