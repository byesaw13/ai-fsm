import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { getPool, query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { draftEstimate } from "@/lib/estimates/ai-draft";
import type { TradeDefinition } from "@/lib/estimates/ai-draft";
import type { PriceBookEntry } from "@/lib/estimates/item-suggester";
import { computeMaterials, computeScopeModifier, buildShoppingList } from "@ai-fsm/domain";
import type { ScopeTemplate, ScopeComponent, ComplexityFactor, ScopeComponentOption, ServiceMaterial, ScopeComponentValues, ComplexityValues } from "@ai-fsm/domain";
import { validateMaterialsForTrade } from "@/lib/estimates/guardrails";

export const dynamic = "force-dynamic";

function findPrimarySqft(scopeValues: Record<string, number | string>): number {
  const sqftKeys = ["wall_sqft", "floor_sqft", "ceiling_sqft", "drywall_sqft", "sqft"];
  for (const key of sqftKeys) {
    const val = Number(scopeValues[key]);
    if (val > 0) return val;
  }
  const lfKeys = ["linear_feet", "lf", "perimeter_lf"];
  for (const key of lfKeys) {
    const val = Number(scopeValues[key]);
    if (val > 0) return val;
  }
  for (const val of Object.values(scopeValues)) {
    const n = Number(val);
    if (n > 0) return n;
  }
  return 1;
}

const bodySchema = z.object({
  description: z.string().min(1).max(5000),
  job_id: z.string().uuid().optional(),
});

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
  default_value: number;
  sort_order: number;
  [key: string]: unknown;
}

export const POST = withAuth(async (request: NextRequest, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parseResult = bodySchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const { description, job_id } = parseResult.data;

  try {
    const pool = getPool();

    // Load active price book
    const { rows: priceBook } = await pool.query<PriceBookEntry>(
      `SELECT id, code, name, category,
              price_min_cents, price_max_cents, default_price_cents, add_on_price_cents,
              unit_type, description, default_labor_hours, requires_materials, upsell_codes,
              labor_hours_typical, scope_description, excluded_items,
              legal_status_ma, legal_status_nh, quote_trigger
       FROM price_book
       WHERE is_active = true
       ORDER BY code ASC`
    );

    // Load scope templates + components + factors
    const { rows: templateRows } = await pool.query<{ id: string; category: string; label: string; description: string | null; default_assumptions: string | null; [key: string]: unknown }>(
      `SELECT id, category, label, description, default_assumptions FROM scope_templates ORDER BY label ASC`
    );

    let templates: ScopeTemplate[] = [];
    if (templateRows.length > 0) {
      const templateIds = templateRows.map((t) => t.id);
      const idPlaceholders = templateIds.map((_, i) => `$${i + 1}`).join(", ");

      const [componentRows, factorRows] = await Promise.all([
        query<ComponentRow>(
          `SELECT id, template_id, key, label, unit, input_type, options::text, required, sort_order
           FROM scope_components WHERE template_id IN (${idPlaceholders}) ORDER BY template_id, sort_order ASC`,
          templateIds
        ),
        query<FactorRow>(
          `SELECT id, template_id, key, label, description, factor_type, default_value::float, sort_order
           FROM complexity_factors WHERE template_id IN (${idPlaceholders}) ORDER BY template_id, sort_order ASC`,
          templateIds
        ),
      ]);

      templates = templateRows.map((t) => ({
        id: t.id,
        category: t.category,
        label: t.label,
        description: t.description,
        default_assumptions: t.default_assumptions,
        components: componentRows
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
        complexity_factors: factorRows
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
    }

    // Load trade definitions
    const { rows: tradeRows } = await pool.query<TradeDefinition>(
      `SELECT trade_key, display_name, scope_template_category,
              service_code_range_start, service_code_range_end, extra_code_notes,
              detection_keywords, routing_rules, disambiguation_rules,
              scope_values_guidance, complexity_guidance, is_active, sort_order
       FROM trades
       WHERE is_active = true
       ORDER BY sort_order ASC`
    );

    // Enriched job context: job title/notes, property address, recent estimate history
    let jobContext: string | undefined;
    if (job_id) {
      const { rows: jobRows } = await pool.query<{
        title: string; notes: string | null; client_id: string; property_id: string | null;
      }>(
        `SELECT j.title, j.notes, j.client_id, j.property_id
         FROM jobs j WHERE j.id = $1 AND j.account_id = $2`,
        [job_id, session.accountId]
      );
      if (jobRows[0]) {
        const { title, notes, client_id, property_id } = jobRows[0];
        const parts: string[] = [`Job: ${title}`];
        if (notes) parts.push(`Notes: ${notes}`);

        if (property_id) {
          const { rows: propRows } = await pool.query<{ address: string; year_built: number | null; sqft: number | null }>(
            `SELECT address, year_built, sqft FROM properties WHERE id = $1 AND account_id = $2`,
            [property_id, session.accountId]
          );
          if (propRows[0]) {
            parts.push(`Property: ${propRows[0].address}`);
            if (propRows[0].year_built) parts.push(`Year built: ${propRows[0].year_built}`);
            if (propRows[0].sqft) parts.push(`Property sqft: ${propRows[0].sqft}`);
          }
        }

        // Recent estimate history for this client (last 3 completed)
        const { rows: recentRows } = await pool.query<{ title: string; total_cents: number; status: string; created_at: string }>(
          `SELECT j.title, e.total_cents, e.status, e.created_at
           FROM estimates e JOIN jobs j ON j.id = e.job_id
           WHERE e.account_id = $1 AND j.client_id = $2 AND e.status IN ('approved','invoiced','sent')
           ORDER BY e.created_at DESC LIMIT 3`,
          [session.accountId, client_id]
        );
        if (recentRows.length > 0) {
          parts.push(`Prior estimates for this client: ${recentRows.map(r => `${r.title} ($${(r.total_cents/100).toFixed(0)}, ${r.status})`).join('; ')}`);
        }

        jobContext = parts.join('\n');
      }
    }

    const draft = await draftEstimate(description, priceBook, templates, tradeRows, jobContext);

    // Compute materials and adjusted price for each service.
    // adjusted_price_cents = (base × sqft if per_sqft) × scope_modifier — shown in review panel.
    const computedByService: Array<{ service_name: string; materials: import("@ai-fsm/domain").ComputedMaterial[] }> = [];

    if (draft && draft.services.length > 0) {
      const categories = [...new Set(draft.services.map((s) => s.service_category))];
      const catPlaceholders = categories.map((_, i) => `$${i + 1}`).join(", ");

      const { rows: materialRows } = await pool.query<ServiceMaterial>(
        `SELECT id, category, material_name, description, quantity_type,
                scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents,
                store_section, sort_order, is_optional, is_consumable, condition_factor_key,
                quantity_flat, price_book_id
         FROM service_materials
         WHERE category IN (${catPlaceholders})
         ORDER BY sort_order ASC`,
        categories
      );

      for (const svc of draft.services) {
        const template = templates.find((t) => t.category === svc.service_category);

        // Build ComplexityValues
        const complexityValues: ComplexityValues = {};
        if (template) {
          for (const f of template.complexity_factors) {
            complexityValues[f.key] = svc.complexity_factor_keys.includes(f.key);
          }
        }

        // Compute materials
        const categoryMaterials = materialRows.filter((m) => m.category === svc.service_category);
        if (categoryMaterials.length) {
          const computed = computeMaterials(categoryMaterials, svc.scope_values as ScopeComponentValues, complexityValues);
          const trade = svc.trade_detected ?? svc.service_category ?? "";
          const { allowed, blocked } = validateMaterialsForTrade(computed, trade);
          if (blocked.length > 0) {
            logger.warn("AI draft: blocked cross-trade materials", { trade, blocked: blocked.map((b) => b.material.material_name), traceId: session.traceId });
          }
          svc.computed_materials = allowed;
          svc.material_total_cents = allowed.reduce((sum, m) => sum + m.total_cost_cents, 0);
          computedByService.push({ service_name: svc.service_name, materials: allowed });
        }

        // Compute adjusted price
        const { multiplier, adderCents } = template
          ? computeScopeModifier(template.complexity_factors, complexityValues)
          : { multiplier: 1, adderCents: 0 };

        if (svc.unit_type === "per_sqft") {
          const sqft = findPrimarySqft(svc.scope_values);
          svc.adjusted_price_cents = Math.round(svc.base_price_cents * sqft * multiplier) + adderCents;
        } else {
          svc.adjusted_price_cents = Math.round(svc.base_price_cents * multiplier) + adderCents;
        }
      }
    }

    // Build unified shopping list (computed catalog materials + specified products from description)
    const shoppingList = draft
      ? buildShoppingList(computedByService, draft.specified_materials ?? [])
      : null;

    return NextResponse.json({ draft, shopping_list: shoppingList });
  } catch (error) {
    logger.error("POST /api/v1/estimates/ai-draft error", error as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to draft estimate", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
