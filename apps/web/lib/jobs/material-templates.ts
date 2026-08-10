/**
 * Deterministic price-book → materials expansion for job buy lists.
 * No AI. Templates are absolute structure; costs resolve from catalog separately.
 */

export type MaterialRole = "must_buy" | "optional" | "consumable";
export type QuantityType = "static" | "per_input" | "tier";

export interface MaterialTemplateRow {
  id: string;
  price_book_id: string;
  price_book_code: string;
  price_book_name: string;
  catalog_material_id: string | null;
  material_name: string;
  quantity_type: QuantityType;
  quantity_flat: number | null;
  input_key: string | null;
  quantity_multiplier: number | null;
  waste_factor: number;
  role: MaterialRole;
  unit_label: string | null;
  store_section: string | null;
  sort_order: number;
  /** Optional catalog cost when joined */
  unit_cost_cents?: number | null;
  supplier?: string | null;
  preferred_vendor?: string | null;
  product_url?: string | null;
  search_query?: string | null;
  sku?: string | null;
  aisle?: string | null;
  bay?: string | null;
}

export type DimensionMap = Record<string, number | undefined | null>;

export interface ExpandedMaterialLine {
  name: string;
  quantity: number;
  unit_label: string | null;
  store_section: string | null;
  catalog_material_id: string | null;
  sku: string | null;
  supplier: string | null;
  aisle: string | null;
  bay: string | null;
  unit_cost_cents: number | null;
  role: MaterialRole;
  generation_source: "template";
  price_book_code: string;
  preferred_vendor: string | null;
  product_url: string | null;
  search_query: string | null;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Expand one template row into a purchase quantity (or null if skipped). */
export function expandTemplateQuantity(
  template: Pick<
    MaterialTemplateRow,
    "quantity_type" | "quantity_flat" | "input_key" | "quantity_multiplier" | "waste_factor"
  >,
  dimensions: DimensionMap = {},
): number | null {
  const waste = num(template.waste_factor) ?? 1;
  if (template.quantity_type === "static") {
    const base = num(template.quantity_flat) ?? 1;
    return Math.max(1, Math.ceil(base * waste));
  }

  if (template.quantity_type === "per_input") {
    const key = template.input_key?.trim();
    if (!key) return null;
    const scope = num(dimensions[key]);
    if (scope == null || scope <= 0) return null;
    const mult = num(template.quantity_multiplier) ?? 1;
    // mult is either rate (qty = scope * mult) or coverage (qty = scope / mult)
    // Convention: quantity_multiplier > 1 with per_input on sqft usually means coverage divisor
    // when material is sheets: 1/32 = 0.03125 stored as multiplier meaning sheets per sqft.
    const raw = scope * mult;
    return Math.max(1, Math.ceil(raw * waste));
  }

  // tier: flat quantity if input present
  if (template.quantity_type === "tier") {
    const key = template.input_key?.trim();
    if (!key) return num(template.quantity_flat) ?? 1;
    const scope = num(dimensions[key]);
    if (scope == null || scope <= 0) return null;
    const base = num(template.quantity_flat) ?? 1;
    return Math.max(1, Math.ceil(base * waste));
  }

  return null;
}

/**
 * Expand templates; skip optional/consumable unless includeOptional.
 * Dedupe by lower(name)+unit, summing quantities.
 */
export function expandMaterialTemplates(
  templates: MaterialTemplateRow[],
  options: {
    dimensions?: DimensionMap;
    includeOptional?: boolean;
    includeConsumable?: boolean;
    customerSuppliedNames?: string[];
  } = {},
): ExpandedMaterialLine[] {
  const {
    dimensions = {},
    includeOptional = false,
    includeConsumable = false,
    customerSuppliedNames = [],
  } = options;

  const blocked = new Set(
    customerSuppliedNames.map((n) => n.trim().toLowerCase()).filter(Boolean),
  );

  const byKey = new Map<string, ExpandedMaterialLine>();

  for (const t of templates) {
    if (t.role === "optional" && !includeOptional) continue;
    if (t.role === "consumable" && !includeConsumable) continue;
    if (blocked.has(t.material_name.trim().toLowerCase())) continue;

    const quantity = expandTemplateQuantity(t, dimensions);
    if (quantity == null) continue;

    const unit = t.unit_label?.trim() || null;
    const key = `${t.material_name.trim().toLowerCase()}||${(unit ?? "").toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    byKey.set(key, {
      name: t.material_name.trim(),
      quantity,
      unit_label: unit,
      store_section: t.store_section?.trim() || null,
      catalog_material_id: t.catalog_material_id,
      sku: t.sku ?? null,
      supplier: t.supplier ?? null,
      aisle: t.aisle ?? null,
      bay: t.bay ?? null,
      unit_cost_cents: t.unit_cost_cents ?? null,
      role: t.role,
      generation_source: "template",
      price_book_code: t.price_book_code,
      preferred_vendor: t.preferred_vendor ?? null,
      product_url: t.product_url ?? null,
      search_query: t.search_query ?? null,
    });
  }

  return [...byKey.values()];
}

/** Suggested package price from labor hours × bill rate (cents). */
export function suggestedPackageCents(
  laborHours: number | null | undefined,
  billRateCentsPerHour: number,
): number | null {
  const h = num(laborHours);
  if (h == null || h <= 0 || billRateCentsPerHour <= 0) return null;
  return Math.round(h * billRateCentsPerHour);
}

export interface PriceBookAuditRow {
  id: string;
  code: string;
  name: string;
  category: string;
  default_price_cents: number | null;
  labor_hours_typical: number | null;
  last_verified_at: string | null;
}

export function auditPriceBookRow(
  row: PriceBookAuditRow,
  billRateCentsPerHour: number,
  laborCostCentsPerHour: number,
): {
  missingLaborHours: boolean;
  underCostFloor: boolean;
  underBillFloor: boolean;
  suggestedPackageCents: number | null;
  packageVsSuggestedPct: number | null;
} {
  const suggested = suggestedPackageCents(row.labor_hours_typical, billRateCentsPerHour);
  const price = num(row.default_price_cents);
  const hours = num(row.labor_hours_typical);
  const missingLaborHours = hours == null;
  const costFloor =
    hours != null && laborCostCentsPerHour > 0
      ? Math.round(hours * laborCostCentsPerHour)
      : null;
  const underCostFloor =
    price != null && costFloor != null ? price < costFloor : false;
  const underBillFloor =
    price != null && suggested != null ? price < Math.round(suggested * 0.7) : false;
  const packageVsSuggestedPct =
    price != null && suggested != null && suggested > 0
      ? Math.round(((price - suggested) / suggested) * 100)
      : null;

  return {
    missingLaborHours,
    underCostFloor,
    underBillFloor,
    suggestedPackageCents: suggested,
    packageVsSuggestedPct,
  };
}
