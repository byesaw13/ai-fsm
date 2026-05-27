/**
 * POST /api/v1/estimates/ai-materials
 * Generate a materials list from scope description + room measurements.
 * Matches items against the account's saved materials price book first;
 * falls back to Claude's market-rate estimates for new items.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateMaterials } from "@/lib/estimates/materials-generator";
import type { SavedMaterial } from "@/lib/estimates/materials-generator";

export const dynamic = "force-dynamic";

const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  length_ft: z.number().nullable().default(null),
  width_ft: z.number().nullable().default(null),
  height_ft: z.number().nullable().default(null),
  notes: z.string().optional(),
});

const bodySchema = z.object({
  scope: z.string().min(3).max(5000),
  job_type: z.string().min(1).max(100),
  rooms: z.array(roomSchema).optional().default([]),
});

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  let body: unknown = {};
  try { body = await request.json(); } catch { /* ok */ }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues, traceId: session.traceId } },
      { status: 422 }
    );
  }

  // Load the account's saved materials price book
  const savedRows = (await query(
    `SELECT id, name, brand, category, unit, unit_cost_cents, supplier
     FROM materials_price_book
     WHERE account_id = $1 AND is_active = true
     ORDER BY name`,
    [session.accountId]
  )) as unknown as SavedMaterial[];

  // Load account pricing settings (markup %)
  const accountRow = await query(
    `SELECT settings FROM accounts WHERE id = $1`,
    [session.accountId]
  );
  const settings = (accountRow[0]?.settings as Record<string, unknown>) ?? {};
  const materialMarkupPct = typeof settings.material_markup_pct === "number"
    ? settings.material_markup_pct
    : undefined;

  try {
    const result = await generateMaterials({
      scope: parsed.data.scope,
      job_type: parsed.data.job_type,
      rooms: parsed.data.rooms,
      saved_materials: savedRows,
      material_markup_pct: materialMarkupPct,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error("POST /api/v1/estimates/ai-materials error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to generate materials list", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
