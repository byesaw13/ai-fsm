import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { withLeadWorkOrderContext } from "../../../../../../lib/work-orders/lead-access";
import { syncWorkOrderStatus } from "../../../../../../lib/work-orders/sync-status";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const ACTIVE_VISIT = ["dispatched", "traveling", "arrived", "in_progress", "waiting"] as const;

export const POST = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const id = request.url.match(/\/work-orders\/([^/]+)\/start-visit/)?.[1];
    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Work order not found", traceId: session.traceId } },
        { status: 404 },
      );
    }

    try {
      const result = await withLeadWorkOrderContext(session, async (client) => {
        const woRes = await client.query<{
        id: string;
        job_id: string | null;
        assigned_user_id: string | null;
        status: string;
      }>(
        `SELECT id, job_id, assigned_user_id, status FROM work_orders
         WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [id, session.accountId],
      );
        const wo = woRes.rows[0];
        if (!wo) {
          return { kind: "not_found" as const };
        }
        if (wo.assigned_user_id !== session.userId) {
          return { kind: "forbidden" as const };
        }
        if (!wo.job_id) {
          return { kind: "no_project" as const };
        }

        const activeRes = await client.query<{ id: string }>(
        `SELECT id FROM visits
         WHERE work_order_id = $1 AND account_id = $2 AND assigned_user_id = $3
           AND status = ANY($4::text[])
         ORDER BY scheduled_start DESC LIMIT 1`,
        [id, session.accountId, session.userId, ACTIVE_VISIT],
      );
        if (activeRes.rows[0]) {
          return { kind: "visit" as const, visit_id: activeRes.rows[0].id, resumed: true, created: false };
        }

        const scheduledRes = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM visits
         WHERE work_order_id = $1 AND account_id = $2 AND assigned_user_id = $3
           AND status = 'scheduled'
           AND scheduled_start::date = CURRENT_DATE
         ORDER BY scheduled_start ASC LIMIT 1`,
        [id, session.accountId, session.userId],
      );
        const scheduled = scheduledRes.rows[0];
        if (scheduled) {
          const updated = await client.query<{ id: string }>(
            `UPDATE visits SET status = 'arrived', arrived_at = COALESCE(arrived_at, now()), updated_at = now()
             WHERE id = $1 RETURNING id`,
            [scheduled.id],
          );
          await syncWorkOrderStatus(client, id, session.accountId);
          return { kind: "visit" as const, visit_id: updated.rows[0].id, resumed: false, created: false };
        }

        const now = new Date();
        const end = new Date(now.getTime() + 60 * 60 * 1000);
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO visits (
             account_id, job_id, work_order_id, assigned_user_id,
             scheduled_start, scheduled_end, status, arrived_at, visit_type
           ) VALUES ($1, $2, $3, $4, $5, $6, 'arrived', now(), 'standard')
           RETURNING id`,
          [session.accountId, wo.job_id, id, session.userId, now.toISOString(), end.toISOString()],
        );
        await syncWorkOrderStatus(client, id, session.accountId);
        return { kind: "visit" as const, visit_id: inserted.rows[0].id, resumed: false, created: true };
      });

      if (result.kind === "not_found") {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Work order not found", traceId: session.traceId } },
          { status: 404 },
        );
      }
      if (result.kind === "forbidden") {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Only the assigned lead can start work", traceId: session.traceId } },
          { status: 403 },
        );
      }
      if (result.kind === "no_project") {
        return NextResponse.json(
          { error: { code: "PRECONDITION_FAILED", message: "Work order has no project", traceId: session.traceId } },
          { status: 422 },
        );
      }
      return NextResponse.json(
        { data: { visit_id: result.visit_id, resumed: result.resumed } },
        { status: result.created ? 201 : 200 },
      );
    } catch (err) {
      logger.error("[work-orders start-visit]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to start visit", traceId: session.traceId } },
        { status: 500 },
      );
    }
  },
);