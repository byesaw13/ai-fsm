import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { ScopeTemplate, ScopeComponent, ComplexityFactor, ProfitabilityRule, ScopeComponentOption, ServiceMaterial, ProductionRate, ProductionRateModifier } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

interface TemplateRow {
  id: string;
  category: string;
  label: string;
  description: string | null;
  default_assumptions: string | null;
  [key: string]: unknown;
}

interface ComponentRow {
  id: string;
  template_id: string;
  key: string;
  label: string;
  unit: string | null;
  input_type: ScopeComponent["input_type"];
  options: string | null;
  required: boolean;
  sort_order: number;
  [key: string]: unknown;
}

interface FactorRow {
  id: string;
  template_id: string;
  key: string;
  label: string;
  description: string | null;
  factor_type: ComplexityFactor["factor_type"];
  default_value: string;
  sort_order: number;
  [key: string]: unknown;
}

interface RuleRow {
  id: string;
  category: string;
  rule_type: ProfitabilityRule["rule_type"];
  value: string;
  description: string | null;
  [key: string]: unknown;
}

interface MaterialRow {
  id: string;
  price_book_id: string | null;
  category: string | null;
  material_name: string;
  description: string | null;
  quantity_type: ServiceMaterial["quantity_type"];
  scope_component_key: string | null;
  quantity_multiplier: number | null;
  quantity_flat: number | null;
  waste_factor: number;
  unit: string;
  unit_cost_cents: number;
  store_section: string;
  is_consumable: boolean;
  is_optional: boolean;
  condition_factor_key: string | null;
  sort_order: number;
  [key: string]: unknown;
}

interface ProductionRateRow {
  id: string;
  service_code: string;
  scope_component_key: string;
  base_rate: string;
  rate_unit: string;
  notes: string | null;
  [key: string]: unknown;
}

interface ProductionRateModifierRow {
  id: string;
  service_code: string;
  complexity_factor_key: string;
  modifier_pct: string;
  notes: string | null;
  [key: string]: unknown;
}

// GET /api/v1/scope-templates — returns all templates with components and factors
// Optional ?category=<category> to fetch a single template
export const GET = withAuth(async (request: NextRequest, session) => {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  try {
    const templateCondition = category ? `WHERE category = $1` : "";
    const templateParams = category ? [category] : [];

    const templates = await query<TemplateRow>(
      `SELECT id, category, label, description, default_assumptions FROM scope_templates ${templateCondition} ORDER BY label ASC`,
      templateParams
    );

    if (templates.length === 0) {
      if (category) {
        return NextResponse.json({ template: null, profitability_rules: [] });
      }
      return NextResponse.json({ templates: [], profitability_rules: [] });
    }

    const templateIds = templates.map((t) => t.id);
    const idPlaceholders = templateIds.map((_, i) => `$${i + 1}`).join(", ");
    const categories = templates.map((t) => t.category);
    const catPlaceholders = categories.map((_, i) => `$${i + 1}`).join(", ");

    // Codes for the categories in scope — used to fetch production rates
    const categoryCodes = await query<{ code: string }>(
      `SELECT code FROM price_book WHERE category IN (${catPlaceholders})`,
      categories
    );
    const codes = categoryCodes.map((r) => r.code);
    const codePlaceholders = codes.length > 0 ? codes.map((_, i) => `$${i + 1}`).join(", ") : "NULL";

    const [components, factors, rules, materials, productionRates, productionModifiers] = await Promise.all([
      query<ComponentRow>(
        `SELECT id, template_id, key, label, unit, input_type, options::text, required, sort_order
         FROM scope_components
         WHERE template_id IN (${idPlaceholders})
         ORDER BY template_id, sort_order ASC`,
        templateIds
      ),
      query<FactorRow>(
        `SELECT id, template_id, key, label, description, factor_type, default_value::float, sort_order
         FROM complexity_factors
         WHERE template_id IN (${idPlaceholders})
         ORDER BY template_id, sort_order ASC`,
        templateIds
      ),
      query<RuleRow>(
        `SELECT id, category, rule_type, value::float, description
         FROM profitability_rules
         WHERE (category IN (${catPlaceholders}) OR category = 'all')
           AND is_active = true`,
        categories
      ),
      query<MaterialRow>(
        `SELECT id, price_book_id, category, material_name, description,
                quantity_type, scope_component_key,
                quantity_multiplier::float, quantity_flat::float,
                waste_factor::float, unit, unit_cost_cents,
                store_section, is_consumable, is_optional,
                condition_factor_key, sort_order
         FROM service_materials
         WHERE category IN (${catPlaceholders})
         ORDER BY category, sort_order ASC`,
        categories
      ),
      codes.length > 0
        ? query<ProductionRateRow>(
            `SELECT id, service_code, scope_component_key, base_rate::float, rate_unit, notes
             FROM production_rates
             WHERE service_code IN (${codePlaceholders})`,
            codes
          )
        : Promise.resolve([] as ProductionRateRow[]),
      codes.length > 0
        ? query<ProductionRateModifierRow>(
            `SELECT id, service_code, complexity_factor_key, modifier_pct::float, notes
             FROM production_rate_modifiers
             WHERE service_code IN (${codePlaceholders})`,
            codes
          )
        : Promise.resolve([] as ProductionRateModifierRow[]),
    ]);

    // Build profitability rules — dedupe by id
    const profitabilityRules: ProfitabilityRule[] = Array.from(
      new Map(rules.map((r) => [r.id, { id: r.id, category: r.category, rule_type: r.rule_type, value: Number(r.value), description: r.description }])).values()
    );

    // Assemble templates
    const assembled: ScopeTemplate[] = templates.map((t) => ({
      id: t.id,
      category: t.category,
      label: t.label,
      description: t.description,
      default_assumptions: t.default_assumptions,
      components: components
        .filter((c) => c.template_id === t.id)
        .map((c) => ({
          id: c.id,
          key: c.key,
          label: c.label,
          unit: c.unit,
          input_type: c.input_type,
          options: c.options ? (JSON.parse(c.options) as ScopeComponentOption[]) : null,
          required: c.required,
          sort_order: c.sort_order,
        })),
      complexity_factors: factors
        .filter((f) => f.template_id === t.id)
        .map((f) => ({
          id: f.id,
          key: f.key,
          label: f.label,
          description: f.description,
          factor_type: f.factor_type,
          default_value: Number(f.default_value),
          sort_order: f.sort_order,
        })),
    }));

    const assembledMaterials: ServiceMaterial[] = materials.map((m) => ({
      id: m.id,
      price_book_id: m.price_book_id,
      category: m.category,
      material_name: m.material_name,
      description: m.description,
      quantity_type: m.quantity_type,
      scope_component_key: m.scope_component_key,
      quantity_multiplier: m.quantity_multiplier,
      quantity_flat: m.quantity_flat,
      waste_factor: m.waste_factor,
      unit: m.unit,
      unit_cost_cents: m.unit_cost_cents,
      store_section: m.store_section,
      is_consumable: m.is_consumable,
      is_optional: m.is_optional,
      condition_factor_key: m.condition_factor_key,
      sort_order: m.sort_order,
    }));

    const assembledProductionRates: ProductionRate[] = productionRates.map((r) => ({
      id: r.id,
      service_code: r.service_code,
      scope_component_key: r.scope_component_key,
      base_rate: Number(r.base_rate),
      rate_unit: r.rate_unit as ProductionRate["rate_unit"],
      notes: r.notes,
    }));

    const assembledProductionModifiers: ProductionRateModifier[] = productionModifiers.map((m) => ({
      id: m.id,
      service_code: m.service_code,
      complexity_factor_key: m.complexity_factor_key,
      modifier_pct: Number(m.modifier_pct),
      notes: m.notes,
    }));

    if (category) {
      return NextResponse.json({
        template: assembled[0] ?? null,
        profitability_rules: profitabilityRules,
        materials: assembledMaterials.filter((m) => m.category === category),
        production_rates: assembledProductionRates,
        production_rate_modifiers: assembledProductionModifiers,
      });
    }

    return NextResponse.json({ templates: assembled, profitability_rules: profitabilityRules, materials: assembledMaterials, production_rates: assembledProductionRates, production_rate_modifiers: assembledProductionModifiers });
  } catch (error) {
    logger.error("[scope-templates GET]", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch scope templates", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
