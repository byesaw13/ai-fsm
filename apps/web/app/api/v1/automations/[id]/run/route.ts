import { NextRequest, NextResponse } from "next/server";
import { withRole } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { query, getPool } from "../../../../../../lib/db";
import { appendAuditLog } from "../../../../../../lib/db/audit";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

export const POST = withRole(
  ["owner", "admin"],
  async (request: NextRequest, session: AuthSession) => {
    const automationId = request.nextUrl.pathname.split("/")[5];

    if (!automationId) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Automation ID required",
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }

    const existing = await query<{ id: string; type: string; account_id: string; enabled: boolean }>(
      `SELECT id, type, account_id, enabled FROM automations WHERE id = $1 AND account_id = $2`,
      [automationId, session.accountId]
    );

    if (existing.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Automation not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }

    const automation = existing[0];

    if (!automation.enabled) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Automation is disabled",
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL app.current_user_id = $1; SET LOCAL app.current_account_id = $2; SET LOCAL app.current_role = $3`,
        [session.userId, session.accountId, session.role]
      );

      await client.query(
        `UPDATE automations SET next_run_at = now(), updated_at = now() WHERE id = $1`,
        [automationId]
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "automation_run",
        entity_id: automationId,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          automation_id: automationId,
          automation_type: automation.type,
          triggered_by: "manual",
          triggered_at: new Date().toISOString(),
        },
      });

      await client.query("COMMIT");

      return NextResponse.json({
        data: {
          id: automationId,
          triggered: true,
          message: `Automation ${automation.type} queued to run`,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[automations run POST]", err, { traceId: session.traceId });
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to trigger automation",
            traceId: session.traceId,
          },
        },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);
