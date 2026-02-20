import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../lib/auth/middleware";
import { query } from "../../../../../lib/db";

export const dynamic = "force-dynamic";

type AuditEventRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  new_value: Record<string, unknown> | null;
  created_at: string;
  actor_id: string;
  [key: string]: unknown;
};

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
    const offset = parseInt(searchParams.get("offset") ?? "0");
    const type = searchParams.get("type");

    const allowedTypes = ["visit_reminder", "invoice_followup"];
    const typeFilter = type && allowedTypes.includes(type) ? type : null;

    let sql: string;
    let params: unknown[];

    if (typeFilter) {
      sql = `SELECT id, entity_type, entity_id, action, new_value, created_at::text, actor_id
             FROM audit_log
             WHERE account_id = $1 AND entity_type = $2
             ORDER BY created_at DESC
             LIMIT $3 OFFSET $4`;
      params = [session.accountId, typeFilter, limit, offset];
    } else {
      sql = `SELECT id, entity_type, entity_id, action, new_value, created_at::text, actor_id
             FROM audit_log
             WHERE account_id = $1 AND entity_type IN ('visit_reminder', 'invoice_followup')
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`;
      params = [session.accountId, limit, offset];
    }

    const events = await query<AuditEventRow>(sql, params);

    const data = events.map((e) => ({
      ...e,
      summary: summarizeEvent(e),
    }));

    return NextResponse.json({ data, limit, offset });
  }
);

function summarizeEvent(event: AuditEventRow): string {
  const val = event.new_value;
  if (!val) return `${event.entity_type} event`;

  if (event.entity_type === "visit_reminder") {
    const clientName = val.client_name ?? "Unknown client";
    const jobTitle = val.job_title ?? "visit";
    return `Reminder sent to ${clientName} for "${jobTitle}"`;
  }

  if (event.entity_type === "invoice_followup") {
    const invoiceNum = val.invoice_number ?? "Unknown";
    const clientName = val.client_name ?? "";
    const step = val.days_overdue_step ?? "?";
    return `Follow-up (day ${step}) sent for invoice #${invoiceNum}${clientName ? ` - ${clientName}` : ""}`;
  }

  return `${event.entity_type} event`;
}
