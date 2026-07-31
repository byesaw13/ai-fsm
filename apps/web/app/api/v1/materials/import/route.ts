/**
 * POST /api/v1/materials/import — owner-only Home Depot purchase history CSV import.
 */
import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { learnMaterialsFromLineItems } from "@/lib/materials/catalog";
import {
  mapHdDepartmentToCategory,
  parseHomeDepotPurchaseCsv,
} from "@/lib/materials/hd-import";

export const dynamic = "force-dynamic";

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  let csvText = "";
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file") ?? form.get("csv");
      if (file instanceof File) {
        csvText = await file.text();
      } else if (typeof file === "string") {
        csvText = file;
      }
    } else if (contentType.includes("application/json")) {
      const body = (await request.json()) as { csv?: string; text?: string };
      csvText = body.csv ?? body.text ?? "";
    } else {
      csvText = await request.text();
    }
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Could not read CSV body",
          traceId: session.traceId,
        },
      },
      { status: 400 },
    );
  }

  if (!csvText.trim()) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Empty CSV — send multipart file, JSON { csv }, or raw text",
          traceId: session.traceId,
        },
      },
      { status: 422 },
    );
  }

  const parsed = parseHomeDepotPurchaseCsv(csvText);
  if (parsed.lines.length === 0) {
    return NextResponse.json(
      {
        data: {
          imported: 0,
          skipped: parsed.skipped.length,
          errors: parsed.skipped.slice(0, 20),
        },
      },
      { status: 200 },
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  let imported = 0;
  const errors: { row: number; reason: string }[] = [...parsed.skipped];

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );

    // Process in small batches by purchase date + category to keep transactions light.
    for (const line of parsed.lines) {
      try {
        const { learned } = await learnMaterialsFromLineItems(
          client,
          {
            accountId: session.accountId,
            supplier: line.supplier,
            purchasedAt: line.purchasedAt,
            category: mapHdDepartmentToCategory(line.department),
          },
          [
            {
              name: line.name,
              unit_cost_cents: line.unit_cost_cents,
              sku: line.sku,
              quantity: line.quantity,
              unit: line.unit,
            },
          ],
        );
        imported += learned;
      } catch (err) {
        errors.push({
          row: line.rawIndex,
          reason: err instanceof Error ? err.message : "import failed",
        });
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/materials/import error", err, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Import failed",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  } finally {
    client.release();
  }

  return NextResponse.json({
    data: {
      imported,
      skipped: errors.length,
      errors: errors.slice(0, 50),
      total_lines_parsed: parsed.lines.length,
    },
  });
});
