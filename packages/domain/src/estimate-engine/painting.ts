import type { RoomSpec, SurfaceSpec, ComputedLineItem, RuleAuditEntry, PricingRules, PaintQuality, PaintingSurfaceType } from "./types";

export interface PaintingOutput {
  lineItems: ComputedLineItem[];
  audit: RuleAuditEntry[];
  totalGallons: number;
  laborCents: number;
  laborCostCents: number;
}

export function expandRooms(
  rooms: RoomSpec[],
  quality: PaintQuality,
  rules: PricingRules
): PaintingOutput {
  const lineItems: ComputedLineItem[] = [];
  const audit: RuleAuditEntry[] = [];
  let totalGallons = 0;
  let laborCents = 0;
  let laborCostCents = 0;
  let lineIdx = 0;

  for (const room of rooms) {
    for (const surface of room.surfaces) {
      const s = computeSurface(surface, room, rules, lineIdx);
      lineItems.push(s.line);
      audit.push(s.auditEntry);
      totalGallons += s.gallons;
      laborCents += s.line.totalCents;
      laborCostCents += s.line.costBasisCents;
      lineIdx++;
    }
  }

  return { lineItems, audit, totalGallons, laborCents, laborCostCents };
}

interface SurfaceResult {
  line: ComputedLineItem;
  auditEntry: RuleAuditEntry;
  gallons: number;
}

function computeSurface(
  surface: SurfaceSpec,
  room: RoomSpec,
  rules: PricingRules,
  idx: number
): SurfaceResult {
  const p = rules.painting;
  const baseRate = p.sqftRateCents[surface.type];
  const prepMult = p.prepMultipliers[surface.prep];

  // Compound multiplier: prep + optional prime/texture + additional coats
  let totalMult = prepMult;
  if (surface.prime) totalMult += p.primeMultiplier;
  if (surface.textureMatch) totalMult += p.textureMatchMultiplier;
  if (room.coats > 1) totalMult += (room.coats - 1) * p.additionalCoatMultiplier;

  const isCountBased = surface.type === "door" || surface.type === "window" || surface.type === "cabinet";
  const isTrim = surface.type === "trim";

  let qty: number;
  let unit: string;
  let sqftEquiv: number; // for gallon calculation
  let laborTotal: number;

  if (isTrim) {
    qty = surface.linearFt ?? 0;
    unit = "lf";
    sqftEquiv = qty * 0.5; // rough sqft equivalent for gallon calc
    laborTotal = Math.round(qty * baseRate * totalMult);
  } else if (isCountBased) {
    qty = surface.count ?? 0;
    unit = "unit";
    sqftEquiv = qty * 21; // ~21 sqft per door/window/cabinet face
    laborTotal = Math.round(qty * baseRate * totalMult);
  } else {
    qty = surface.sqft ?? 0;
    unit = "sqft";
    sqftEquiv = qty;
    laborTotal = Math.round(qty * baseRate * totalMult);
  }

  const gallons = sqftEquiv > 0
    ? Math.ceil((sqftEquiv * room.coats) / p.coverageSqftPerGallon)
    : 0;

  // Internal cost: approximate hours at 150 sqft/hr, then × cost rate
  const approxHours = sqftEquiv / 150;
  const costBasis = Math.round(approxHours * rules.laborCostCentsPerHour);

  const label = `${room.name} — ${surfaceLabel(surface.type)}`;

  return {
    line: {
      id: `paint-${room.id}-${surface.type}-${idx}`,
      category: "labor",
      description: label,
      quantity: qty,
      unit,
      unitAmountCents: qty > 0 ? Math.round(laborTotal / qty) : 0,
      totalCents: laborTotal,
      costBasisCents: costBasis,
      marginCents: laborTotal - costBasis,
      sourceRule: `painting.${surface.type}`,
      visibleToCustomer: true,
      roomId: room.id,
    },
    auditEntry: {
      rule: `painting.${surface.type}`,
      input: { room: room.name, sqft: surface.sqft, lf: surface.linearFt, count: surface.count, prep: surface.prep, prime: surface.prime, textureMatch: surface.textureMatch, coats: room.coats, baseRate, totalMult },
      output: { laborTotal, gallons, costBasis },
    },
    gallons,
  };
}

export interface PaintMaterialsResult {
  materialCents: number;
  handlingCents: number;
  materialLine: ComputedLineItem;
  handlingLine: ComputedLineItem;
  auditEntry: RuleAuditEntry;
}

export function computePaintMaterials(
  gallons: number,
  quality: PaintQuality,
  rules: PricingRules
): PaintMaterialsResult {
  const pricePerGallon = rules.painting.paintCentsPerGallon[quality];
  const materialCents = gallons * pricePerGallon;
  const handlingCents = Math.round(materialCents * rules.materialHandlingRate);

  const materialLine: ComputedLineItem = {
    id: "paint-material",
    category: "material",
    description: `Paint — ${quality} (${gallons} gal)`,
    quantity: gallons,
    unit: "gal",
    unitAmountCents: pricePerGallon,
    totalCents: materialCents,
    costBasisCents: materialCents,
    marginCents: 0,
    sourceRule: "painting.materials",
    visibleToCustomer: true,
  };

  const handlingLine: ComputedLineItem = {
    id: "paint-handling",
    category: "handling",
    description: `Material handling (${Math.round(rules.materialHandlingRate * 100)}%)`,
    quantity: 1,
    unit: "flat",
    unitAmountCents: handlingCents,
    totalCents: handlingCents,
    costBasisCents: 0,
    marginCents: handlingCents,
    sourceRule: "material.handling",
    visibleToCustomer: true,
  };

  return {
    materialCents,
    handlingCents,
    materialLine,
    handlingLine,
    auditEntry: {
      rule: "painting.materials",
      input: { gallons, quality, pricePerGallon, handlingRate: rules.materialHandlingRate },
      output: { materialCents, handlingCents },
    },
  };
}

function surfaceLabel(type: PaintingSurfaceType): string {
  const labels: Record<PaintingSurfaceType, string> = {
    walls: "Walls", ceiling: "Ceiling", trim: "Trim",
    door: "Doors", window: "Windows", cabinet: "Cabinets",
    exterior_siding: "Siding", deck: "Deck",
  };
  return labels[type];
}
