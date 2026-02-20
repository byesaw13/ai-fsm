import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import AutomationsClient from "./AutomationsClient";

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

type AuditEventRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  new_value: Record<string, unknown> | null;
  created_at: string;
  [key: string]: unknown;
};

async function getAutomationStats(
  accountId: string,
  type: "visit_reminder" | "invoice_followup"
): Promise<EventStats> {
  const last24h = await query<{ sent: number }>(
    `SELECT COUNT(*)::int AS sent
     FROM audit_log
     WHERE account_id = $1 
       AND entity_type = $2
       AND created_at >= now() - interval '24 hours'`,
    [accountId, type]
  );

  const last7d = await query<{ sent: number }>(
    `SELECT COUNT(*)::int AS sent
     FROM audit_log
     WHERE account_id = $1 
       AND entity_type = $2
       AND created_at >= now() - interval '7 days'`,
    [accountId, type]
  );

  return {
    last_24h: { sent: last24h[0]?.sent ?? 0, skipped: 0, errors: 0 },
    last_7d: { sent: last7d[0]?.sent ?? 0, skipped: 0, errors: 0 },
  };
}

async function getRecentEvents(accountId: string): Promise<AuditEventRow[]> {
  return query<AuditEventRow>(
    `SELECT id, entity_type, entity_id, new_value, created_at::text
     FROM audit_log
     WHERE account_id = $1 
       AND entity_type IN ('visit_reminder', 'invoice_followup')
     ORDER BY created_at DESC
     LIMIT 20`,
    [accountId]
  );
}

export default async function AutomationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.role === "owner" || session.role === "admin";

  const automations = await query<AutomationRow>(
    `SELECT id, account_id, type, enabled, config, 
            next_run_at::text, last_run_at::text
     FROM automations
     WHERE account_id = $1
     ORDER BY type ASC`,
    [session.accountId]
  );

  const visitReminder = automations.find((a) => a.type === "visit_reminder");
  const invoiceFollowup = automations.find((a) => a.type === "invoice_followup");

  const [visitReminderStats, invoiceFollowupStats, recentEvents] = await Promise.all([
    getAutomationStats(session.accountId, "visit_reminder"),
    getAutomationStats(session.accountId, "invoice_followup"),
    getRecentEvents(session.accountId),
  ]);

  return (
    <AutomationsClient
      visitReminder={visitReminder ?? null}
      invoiceFollowup={invoiceFollowup ?? null}
      visitReminderStats={visitReminderStats}
      invoiceFollowupStats={invoiceFollowupStats}
      recentEvents={recentEvents}
      isAdmin={isAdmin}
    />
  );
}
