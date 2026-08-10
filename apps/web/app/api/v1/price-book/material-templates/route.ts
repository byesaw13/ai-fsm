import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  auditPriceBookRow,
  type PriceBookAuditRow,
} from "@/lib/jobs/material-templates";

export const dynamic = "force-dynamic";

/**
 * GET — list price-book tasks that have material templates, plus a light pricing audit.
 * Used by Job Materials "Build from tasks" picker.
 */
export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  try {
    return await withDbSession(session, async (client) => {
      const settings = await client.query<{
        labor_billing_cents_per_hour: number;
        labor_cost_cents_per_hour: number;
      }>(
        `SELECT labor_billing_cents_per_hour, labor_cost_cents_per_hour
         FROM business_pricing_settings
         WHERE account_id = $1
         LIMIT 1`,
        [session.accountId],
      );
      const bill = settings.rows[0]?.labor_billing_cents_per_hour ?? 11500;
      const cost = settings.rows[0]?.labor_cost_cents_per_hour ?? 5000;

      const tasks = await client.query<
        PriceBookAuditRow & {
          template_count: string;
          material_inclusion: string;
        }
      >(
        `SELECT pb.id, pb.code, pb.name, pb.category::text AS category,
                pb.default_price_cents, pb.labor_hours_typical::float AS labor_hours_typical,
                pb.last_verified_at::text AS last_verified_at,
                pb.material_inclusion::text AS material_inclusion,
                COUNT(t.id)::text AS template_count
         FROM price_book pb
         LEFT JOIN price_book_material_templates t ON t.price_book_id = pb.id
         WHERE pb.is_active = true
         GROUP BY pb.id
         HAVING COUNT(t.id) > 0
         ORDER BY pb.code ASC`,
      );

      const withAudit = tasks.rows.map((row) => {
        const audit = auditPriceBookRow(row, bill, cost);
        return {
          id: row.id,
          code: row.code,
          name: row.name,
          category: row.category,
          default_price_cents: row.default_price_cents,
          labor_hours_typical: row.labor_hours_typical,
          last_verified_at: row.last_verified_at,
          material_inclusion: row.material_inclusion,
          template_count: Number(row.template_count),
          audit,
        };
      });

      return NextResponse.json({
        data: {
          tasks: withAudit,
          rates: {
            labor_billing_cents_per_hour: bill,
            labor_cost_cents_per_hour: cost,
          },
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
