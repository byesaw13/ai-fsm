import { NextRequest, NextResponse } from "next/server";
import { withRole, type AuthSession } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET — list price-book tasks that have material templates.
 * Used by Job Materials "Build from tasks" picker. Owner/admin only.
 */
export const GET = withRole(["owner", "admin"], async (_request: NextRequest, session: AuthSession) => {
  try {
    return await withDbSession(session, async (client) => {
      const tasks = await client.query<{
        id: string;
        code: string;
        name: string;
        category: string;
        template_count: string;
        must_buy_count: string;
        optional_count: string;
        consumable_count: string;
        input_keys: string[] | null;
      }>(
        `SELECT pb.id, pb.code, pb.name, pb.category::text AS category,
                COUNT(t.id)::text AS template_count,
                COUNT(t.id) FILTER (WHERE t.role = 'must_buy')::text AS must_buy_count,
                COUNT(t.id) FILTER (WHERE t.role = 'optional')::text AS optional_count,
                COUNT(t.id) FILTER (WHERE t.role = 'consumable')::text AS consumable_count,
                array_remove(array_agg(DISTINCT t.input_key), NULL) AS input_keys
         FROM price_book pb
         JOIN price_book_material_templates t ON t.price_book_id = pb.id
         WHERE pb.is_active = true
         GROUP BY pb.id
         HAVING COUNT(t.id) > 0
         ORDER BY pb.code ASC`,
      );

      return NextResponse.json({
        data: {
          tasks: tasks.rows.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            category: row.category,
            template_count: Number(row.template_count),
            must_buy_count: Number(row.must_buy_count),
            optional_count: Number(row.optional_count),
            consumable_count: Number(row.consumable_count),
            input_keys: row.input_keys ?? [],
          })),
        },
      });
    });
  } catch (err) {
    logger.error("GET /api/v1/price-book/material-templates", err, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not load material templates",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});
