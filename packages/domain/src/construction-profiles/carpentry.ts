import type { TradeConstructionProfile } from "./types";
import { OSI_QUAD_MAX_SEALANT_CENTS, CORTEX_PVC_FASTENER_KIT_CENTS } from "../shared-hardware-prices";

export const CARPENTRY_CONSTRUCTION_PROFILE: TradeConstructionProfile = {
  tradeKey: "carpentry",
  displayName: "Carpentry & Exterior Trim",
  buildingCodeNotes: [
    "PVC trim requires 1/8 inch expansion gap per 18 ft length for thermal expansion.",
    "Exterior trim penetrations must be flashed with Z-flashing or drip cap above garage/window headers.",
    "Stainless steel or Cortex hidden composite fasteners must be used on PVC trim to prevent rusting and bleed-through.",
  ],
  standardSteps: [
    {
      phase: "prep",
      name: "Site Protection & Setup",
      description: "Set drop cloths, stage saw horses, verify electrical outlet for power tools.",
      isInspection: false,
    },
    {
      phase: "demo_inspection",
      name: "Demo Rotted Trim & Substrate Inspection",
      description: "Scrape/remove existing rotted wood. Inspect underlying OSB/plywood sheathing and wall studs for moisture rot.",
      isInspection: true,
      concealedRiskFlag: "SUBSTRATE_ROT_RISK",
    },
    {
      phase: "substrate_framing",
      name: "Substrate & Flashing Repair",
      description: "Replace rotted framing/sheathing if needed. Verify Z-flashing or drip cap above header.",
      isInspection: false,
    },
    {
      phase: "installation",
      name: "PVC / Trim Board Cutting & Fastening",
      description: "Miter and cut Cellular PVC trim. Fasten with Cortex hidden screws or 316-grade stainless steel trim screws.",
      isInspection: false,
    },
    {
      phase: "weatherproofing_sealing",
      name: "Joint Sealing & Perimeter Caulking",
      description: "Apply PVC cement at glued joints. Seal perimeter seams and brickmould to siding/masonry using OSI Quad Max polyurethane sealant.",
      isInspection: false,
    },
    {
      phase: "testing_finish",
      name: "Clean & Final Inspection",
      description: "Wipe down trim faces, remove debris, inspect weather-tight seals.",
      isInspection: false,
    },
  ],
  concealedRisks: [
    {
      triggerKeywords: ["rot", "rotted", "trim", "garage", "exterior", "soffit", "fascia"],
      riskName: "Substrate & Framing Rot",
      inspectionStep: "Inspect OSB sheathing and corner studs upon trim removal.",
      changeOrderDisclaimer: "If underlying sheathing or wall framing is soft or rotted upon trim removal, structural framing repairs will be quoted under an authorized Change Order ($85/hr + materials).",
      estimatedLaborAddHrsOnFailure: 2.5,
    },
  ],
  requiredHardware: [
    {
      triggerKeywords: ["pvc", "vinyl", "azek", "exterior trim", "garage trim"],
      category: "sealants",
      productName: "OSI Quad Max Exterior Polyurethane Sealant",
      unit: "tube",
      reasoning: "High-flexibility exterior polyurethane caulk required to seal PVC-to-siding and brickmould joints against water intrusion.",
      estUnitCostCents: OSI_QUAD_MAX_SEALANT_CENTS,
    },
    {
      triggerKeywords: ["pvc", "vinyl", "azek", "exterior trim", "garage trim"],
      category: "fasteners",
      productName: "Cortex PVC Hidden Fastening Screws + Plugs (100 pack)",
      unit: "box",
      reasoning: "Stainless steel hidden screws with matching PVC plugs to prevent rust bleeding and maintain seamless finish.",
      estUnitCostCents: CORTEX_PVC_FASTENER_KIT_CENTS,
    },
    {
      triggerKeywords: ["garage trim", "exterior door trim", "window trim"],
      category: "flashing",
      productName: "Aluminum Z-Flashing / Drip Cap (10 ft)",
      unit: "piece",
      reasoning: "Drip cap flashing above horizontal exterior header to shed rainwater over trim face.",
      estUnitCostCents: 1450,
    },
  ],
};
