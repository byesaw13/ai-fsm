import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { ScopeTemplate, ScopeComponent, ComplexityFactor, ProfitabilityRule, ScopeComponentOption, ServiceMaterial } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

interface TemplateRow {
  id: string;
  category: string;
  label: string;
  description: string | null;
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

// GET /api/v1/scope-templates — returns all templates with components and factors
// Optional ?category=<category> to fetch a single template
export const GET = withAuth(async (request: NextRequest, session) => {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  try {
    const templateCondition = category ? `WHERE category = $1` : "";
    const templateParams = category ? [category] : [];

    const templates = await query<TemplateRow>(
      `SELECT id, category, label, description FROM scope_templates ${templateCondition} ORDER BY label ASC`,
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

    const [components, factors, rules, materials] = await Promise.all([
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

    if (category) {
      return NextResponse.json({
        template: assembled[0] ?? null,
        profitability_rules: profitabilityRules,
        materials: assembledMaterials.filter((m) => m.category === category),
      });
    }

    return NextResponse.json({ templates: assembled, profitability_rules: profitabilityRules, materials: assembledMaterials });
  } catch (error) {
    logger.error("[scope-templates GET]", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch scope templates", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
