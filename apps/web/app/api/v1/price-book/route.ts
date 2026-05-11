import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { priceBookCategorySchema, priceBookTierSchema } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  category: priceBookCategorySchema.optional(),
  tier: priceBookTierSchema.optional(),
  search: z.string().max(200).optional(),
  active_only: z.enum(["true", "false"]).default("true"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

type PriceBookRow = {
  id: string;
  code: string;
  name: string;
  category: string;
  tier: string;
  price_min_cents: number;
  price_max_cents: number | null;
  default_price_cents: number | null;
  add_on_price_cents: number | null;
  unit_type: string | null;
  description: string | null;
  notes: string | null;
  default_labor_hours: number | null;
  requires_materials: boolean;
  upsell_codes: string[];
  is_active: boolean;
  // Migration 042 enrichment
  labor_hours_low: number | null;
  labor_hours_typical: number | null;
  labor_hours_high: number | null;
  scope_description: string | null;
  excluded_items: string | null;
  legal_status_ma: "legal" | "gray" | "restricted";
  legal_status_nh: "legal" | "gray" | "restricted";
  two_person_required: boolean;
  quote_trigger: boolean;
  created_at: string;
  updated_at: string;
};

// GET /api/v1/price-book — list services with optional filters
export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const { searchParams } = new URL(request.url);
  const parseResult = listQuerySchema.safeParse({
    category: searchParams.get("category") ?? undefined,
    tier: searchParams.get("tier") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    active_only: searchParams.get("active_only") ?? "true",
    limit: searchParams.get("limit") ?? "100",
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { category, tier, search, active_only, limit } = parseResult.data;

  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (category) {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }
    if (tier) {
      conditions.push(`tier = $${idx++}`);
      params.push(tier);
    }
    if (active_only === "true") {
      conditions.push(`is_active = true`);
    }
    if (search) {
      conditions.push(`(code ILIKE $${idx} OR name ILIKE $${idx} OR description ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(limit);

    const rows = await query<PriceBookRow>(
      `SELECT id, code, name, category, tier, price_min_cents, price_max_cents,
              default_price_cents, add_on_price_cents, unit_type,
              description, notes, default_labor_hours, requires_materials,
              upsell_codes, is_active,
              labor_hours_low, labor_hours_typical, labor_hours_high,
              scope_description, excluded_items,
              legal_status_ma, legal_status_nh, two_person_required, quote_trigger,
              created_at::text, updated_at::text
       FROM price_book
       ${where}
       ORDER BY code ASC
       LIMIT $${idx}`,
      params
    );

    return NextResponse.json({ data: rows });
  } catch (error) {
    logger.error("[price-book GET]", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch price book",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
