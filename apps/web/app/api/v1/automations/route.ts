import { NextRequest, NextResponse } from "next/server";
import { withAuth, withRole } from "../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../lib/auth/middleware";
import { query, getPool } from "../../../../lib/db";
import { appendAuditLog } from "../../../../lib/db/audit";
import { logger } from "../../../../lib/logger";

export const dynamic = "force-dynamic";

type AutomationRow = {
  id: string;
  account_id: string;
  type: "visit_reminder" | "invoice_followup";
  enabled: boolean;
  config: Record<string, unknown>;
  next_run_at: string | null;
  last_run_at: string | null;
  [key: string]: unknown;
};

interface EventStats {
  last_24h: { sent: number; skipped: number; errors: number };
  last_7d: { sent: number; skipped: number; errors: number };
}

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const automations = await query<AutomationRow>(
      `SELECT id, account_id, type, enabled, config, 
              next_run_at::text, last_run_at::text
       FROM automations
       WHERE account_id = $1
       ORDER BY type ASC, created_at ASC`,
      [session.accountId]
    );

    const statsMap = new Map<string, EventStats>();

    for (const auto of automations) {
      const stats = await getEventStats(session.accountId, auto.type);
      statsMap.set(auto.id, stats);
    }

    const data = automations.map((a) => ({
      ...a,
      stats: statsMap.get(a.id) ?? {
        last_24h: { sent: 0, skipped: 0, errors: 0 },
        last_7d: { sent: 0, skipped: 0, errors: 0 },
      },
    }));

    return NextResponse.json({ data });
  }
);

async function getEventStats(
  accountId: string,
  type: "visit_reminder" | "invoice_followup"
): Promise<EventStats> {
  const entityType = type === "visit_reminder" ? "visit_reminder" : "invoice_followup";

  const last24h = await query<{ sent: number; skipped: number }>(
    `SELECT 
       COUNT(*) FILTER (WHERE new_value->>'reminder_sent_at' IS NOT NULL 
                         OR new_value->>'followup_sent_at' IS NOT NULL)::int AS sent,
       0 AS skipped
     FROM audit_log
     WHERE account_id = $1 
       AND entity_type = $2
       AND created_at >= now() - interval '24 hours'`,
    [accountId, entityType]
  );

  const last7d = await query<{ sent: number; skipped: number }>(
    `SELECT 
       COUNT(*) FILTER (WHERE new_value->>'reminder_sent_at' IS NOT NULL 
                         OR new_value->>'followup_sent_at' IS NOT NULL)::int AS sent,
       0 AS skipped
     FROM audit_log
     WHERE account_id = $1 
       AND entity_type = $2
       AND created_at >= now() - interval '7 days'`,
    [accountId, entityType]
  );

  return {
    last_24h: {
      sent: last24h[0]?.sent ?? 0,
      skipped: 0,
      errors: 0,
    },
    last_7d: {
      sent: last7d[0]?.sent ?? 0,
      skipped: 0,
      errors: 0,
    },
  };
}

export const POST = withRole(
  ["owner", "admin"],
  async (request: NextRequest, session: AuthSession) => {
    const body = await request.json().catch(() => ({}));
    const { type, config } = body;

    if (!type || !["visit_reminder", "invoice_followup"].includes(type)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid automation type",
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

      const { rows } = await client.query(
        `INSERT INTO automations (account_id, type, enabled, config, next_run_at)
         VALUES ($1, $2, true, $3, now())
         RETURNING id, account_id, type, enabled, config, next_run_at::text, last_run_at::text`,
        [session.accountId, type, JSON.stringify(config ?? {})]
      );

      const automation = rows[0];

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "automation",
        entity_id: automation.id,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: automation,
      });

      await client.query("COMMIT");
      return NextResponse.json({ data: automation }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[automations POST]", err, { traceId: session.traceId });
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create automation",
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
