import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { suggestLineItems, type PriceBookEntry } from "@/lib/estimates/item-suggester";
import { priceBookCategorySchema } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  description: z.string().min(1).max(5000),
  // Optional category hint — narrows the catalog so Claude focuses on the right section
  category: priceBookCategorySchema.optional(),
});

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
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.issues,
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { description, category } = parseResult.data;

  try {
    const conditions: string[] = ["is_active = true"];
    const params: unknown[] = [];

    if (category) {
      conditions.push(`category = $${params.length + 1}`);
      params.push(category);
    }

    const { rows: priceBook } = await getPool().query<PriceBookEntry>(
      `SELECT id, code, name, category,
              price_min_cents, price_max_cents, default_price_cents, add_on_price_cents,
              unit_type, description, default_labor_hours, requires_materials, upsell_codes,
              labor_hours_typical, scope_description, excluded_items,
              legal_status_ma, legal_status_nh, quote_trigger
       FROM price_book
       WHERE ${conditions.join(" AND ")}
       ORDER BY code ASC`,
      params
    );

    const suggestions = await suggestLineItems(description, priceBook);

    return NextResponse.json({ suggestions });
  } catch (error) {
    logger.error("POST /api/v1/estimates/ai-items error", error as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to suggest items", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
