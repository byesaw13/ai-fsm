import { z } from "zod";

const uuidField = z.string().uuid();
const centsField = z.number().int().nonnegative();
const timestampField = z.string().datetime();

export const priceBookCategorySchema = z.enum([
  "general_repairs",
  "plumbing",
  "electrical",
  "carpentry_furniture",
  "painting_finishes",
  "outdoor_seasonal",
  "mounting_installs",
  "maintenance_small",
  "specialty_expansion",
]);
export type PriceBookCategory = z.infer<typeof priceBookCategorySchema>;

export const PRICE_BOOK_CATEGORY_LABELS: Record<PriceBookCategory, string> = {
  general_repairs: "General Repairs",
  plumbing: "Plumbing",
  electrical: "Electrical",
  carpentry_furniture: "Carpentry & Furniture",
  painting_finishes: "Painting & Finishes",
  outdoor_seasonal: "Outdoor & Seasonal",
  mounting_installs: "Mounting & Installs",
  maintenance_small: "Maintenance & Small Jobs",
  specialty_expansion: "Specialty & Expansion",
};

export const priceBookTierSchema = z.enum(["core", "standard", "specialty"]);
export type PriceBookTier = z.infer<typeof priceBookTierSchema>;

export const PRICE_BOOK_TIER_LABELS: Record<PriceBookTier, string> = {
  core: "Core",
  standard: "Standard",
  specialty: "Specialty",
};

export const priceBookLegalStatusSchema = z.enum(["legal", "gray", "restricted"]);
export type PriceBookLegalStatus = z.infer<typeof priceBookLegalStatusSchema>;

export const priceBookItemSchema = z.object({
  id: uuidField,
  code: z.string().min(1),
  name: z.string().min(1),
  category: priceBookCategorySchema,
  tier: priceBookTierSchema,
  price_min_cents: centsField,
  price_max_cents: centsField.nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  default_labor_hours: z.number().nullable().optional(),
  requires_materials: z.boolean().default(false),
  upsell_codes: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  default_price_cents: centsField.nullable().optional(),
  add_on_price_cents: centsField.nullable().optional(),
  unit_type: z.enum(["flat", "per_unit", "per_sqft", "per_hour", "per_room"]).nullable().optional(),
  labor_hours_low: z.number().nullable().optional(),
  labor_hours_typical: z.number().nullable().optional(),
  labor_hours_high: z.number().nullable().optional(),
  scope_description: z.string().nullable().optional(),
  excluded_items: z.string().nullable().optional(),
  legal_status_ma: priceBookLegalStatusSchema.default("legal"),
  legal_status_nh: priceBookLegalStatusSchema.default("legal"),
  two_person_required: z.boolean().default(false),
  quote_trigger: z.boolean().default(false),
  created_at: timestampField,
  updated_at: timestampField,
});
export type PriceBookItem = z.infer<typeof priceBookItemSchema>;

export const priceBookModifierSchema = z.object({
  id: uuidField,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  labor_hours_adjustment: z.number().nullable().optional(),
  labor_pct_adjustment: z.number().nullable().optional(),
  cost_adjustment_cents: z.number().int().nullable().optional(),
  applies_when: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  created_at: timestampField,
});
export type PriceBookModifier = z.infer<typeof priceBookModifierSchema>;

// Tier-to-margin mapping from the pricing guide
export const PRICE_BOOK_TIER_MARGINS: Record<PriceBookTier, { min: number; max: number }> = {
  core: { min: 0.25, max: 0.35 },
  standard: { min: 0.20, max: 0.30 },
  specialty: { min: 0.15, max: 0.25 },
};

// Calculate price from cost using target margin: Price = Cost / (1 - Margin)
export function priceFromMargin(costCents: number, margin: number): number {
  if (margin >= 1) return costCents;
  return Math.round(costCents / (1 - margin));
}
