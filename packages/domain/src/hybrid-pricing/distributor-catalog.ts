import type { Layer2DistributorCatalogItem } from "./types";
import { OSI_QUAD_MAX_SEALANT_CENTS, CORTEX_PVC_FASTENER_KIT_CENTS } from "../shared-hardware-prices";

export const LAYER2_DISTRIBUTOR_CATALOG: Layer2DistributorCatalogItem[] = [
  {
    sku: "HD-PVC-1X6-18",
    brand: "Azek / Royal",
    name: "1 in. x 6 in. x 18 ft. Cellular PVC Trim Board White",
    category: "trim",
    unitCostCents: 6450, // $64.50 per 18' board (~$3.58/LF)
    packQuantity: 18,
    unitOfMeasure: "LF",
    supplier: "Azek",
  },
  {
    sku: "HD-OSI-QUAD-MAX",
    brand: "OSI",
    name: "OSI Quad Max 9.5 oz. Exterior Polyurethane Sealant White",
    category: "sealants",
    unitCostCents: OSI_QUAD_MAX_SEALANT_CENTS,
    packQuantity: 1,
    unitOfMeasure: "tube",
    supplier: "Home Depot",
    isFastenerOrConsumableKit: true,
  },
  {
    sku: "HD-CORTEX-PVC-100",
    brand: "FastenMaster",
    name: "Cortex Hidden Fastening System for PVC Trim (100 Screws + Plugs)",
    category: "fasteners",
    unitCostCents: CORTEX_PVC_FASTENER_KIT_CENTS,
    packQuantity: 100,
    unitOfMeasure: "box",
    supplier: "Home Depot",
    isFastenerOrConsumableKit: true,
  },
  {
    sku: "HD-ELEC-BRACE-BOX",
    brand: "Commercial Electric",
    name: "Heavy-Duty 15.5 cu. in. Ceiling Fan & Fixture Joist Brace Box",
    category: "electrical",
    unitCostCents: 2450, // $24.50
    packQuantity: 1,
    unitOfMeasure: "each",
    supplier: "Home Depot",
    isFastenerOrConsumableKit: true,
  },
  {
    sku: "HD-WAGO-221-50",
    brand: "WAGO",
    name: "221 Lever-Nut 2-Wire & 3-Wire Compact Connectors (50-Pack)",
    category: "electrical",
    unitCostCents: 2150, // $21.50
    packQuantity: 50,
    unitOfMeasure: "box",
    supplier: "Home Depot",
    isFastenerOrConsumableKit: true,
  },
  {
    sku: "HD-ZINSSER-BIN-1G",
    brand: "Zinsser",
    name: "B-I-N 1 Gal. White Shellac-Based Interior/Exterior Primer",
    category: "paint",
    unitCostCents: 6200, // $62.00
    packQuantity: 1,
    unitOfMeasure: "gallon",
    supplier: "Home Depot",
  },
];

export function getLayer2MaterialCost(
  itemCodeOrCategory: string,
  quantity: number
): { materialCents: number; consumablesCents: number; matchedItems: Layer2DistributorCatalogItem[] } {
  const code = itemCodeOrCategory.toLowerCase();
  const matched: Layer2DistributorCatalogItem[] = [];

  if (code.includes("pvc") || code.includes("garage trim") || code.includes("trim")) {
    const board = LAYER2_DISTRIBUTOR_CATALOG.find((i) => i.sku === "HD-PVC-1X6-18")!;
    const caulk = LAYER2_DISTRIBUTOR_CATALOG.find((i) => i.sku === "HD-OSI-QUAD-MAX")!;
    const screws = LAYER2_DISTRIBUTOR_CATALOG.find((i) => i.sku === "HD-CORTEX-PVC-100")!;
    matched.push(board, caulk, screws);

    const boardsNeeded = Math.ceil(quantity / 18);
    const materialCents = boardsNeeded * board.unitCostCents;
    const consumablesCents = caulk.unitCostCents + screws.unitCostCents;
    return { materialCents, consumablesCents, matchedItems: matched };
  }

  if (code.includes("chandelier") || code.includes("fixture") || code.includes("light")) {
    const brace = LAYER2_DISTRIBUTOR_CATALOG.find((i) => i.sku === "HD-ELEC-BRACE-BOX")!;
    const wago = LAYER2_DISTRIBUTOR_CATALOG.find((i) => i.sku === "HD-WAGO-221-50")!;
    matched.push(brace, wago);
    return { materialCents: 0, consumablesCents: brace.unitCostCents + wago.unitCostCents, matchedItems: matched };
  }

  // Fallback default
  return { materialCents: Math.round(quantity * 350), consumablesCents: 1500, matchedItems: [] };
}
