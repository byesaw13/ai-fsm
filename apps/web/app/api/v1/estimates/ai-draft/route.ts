import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { getPool, query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { draftEstimate } from "@/lib/estimates/ai-draft";
import type { PriceBookEntry } from "@/lib/estimates/item-suggester";
import type { ScopeTemplate, ScopeComponent, ComplexityFactor, ScopeComponentOption } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

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

    // Optional job context
    let jobContext: string | undefined;
    if (job_id) {
      const { rows: jobRows } = await pool.query<{ title: string; notes: string | null }>(
        `SELECT title, notes FROM jobs WHERE id = $1 AND account_id = $2`,
        [job_id, session.accountId]
      );
      if (jobRows[0]) {
        jobContext = jobRows[0].notes
          ? `${jobRows[0].title} — ${jobRows[0].notes}`
          : jobRows[0].title;
      }
    }

    const draft = await draftEstimate(description, priceBook, templates, jobContext);

    return NextResponse.json({ draft });
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
