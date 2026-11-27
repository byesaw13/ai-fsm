/**
 * TASK-260: "Call back" in Needs Attention. Derived from communications_log,
 * nothing stored: a customer's missed call or voicemail in the last 14 days
 * with no later call from us, no later text we chose to send (automated
 * reminders don't count), and no later answered call from them.
 */
import type { Route } from "next";

export const CALL_BACK_LABEL = "Call back";

export type CallBackRow = { client_id: string; name: string; missed_at: string };

export const CALL_BACK_SQL = `
  SELECT DISTINCT ON (m.client_id) m.client_id, c.name, m.created_at::text AS missed_at
  FROM communications_log m
  JOIN clients c ON c.id = m.client_id AND c.account_id = m.account_id
  WHERE m.account_id = $1
    AND m.channel = 'phone'
    AND m.direction = 'inbound'
    AND m.outcome IN ('missed', 'left_voicemail')
    AND m.created_at > now() - interval '14 days'
    AND NOT EXISTS (
      SELECT 1 FROM communications_log r
      WHERE r.account_id = m.account_id
        AND r.client_id = m.client_id
        AND r.created_at > m.created_at
        AND (
          (r.channel = 'phone' AND r.direction = 'outbound')
          OR (r.channel = 'phone' AND r.direction = 'inbound' AND r.outcome = 'answered')
          OR (r.channel = 'sms' AND r.direction = 'outbound' AND r.initiated_by IS NOT NULL
              AND r.outcome IN ('sent', 'delivered'))
        )
    )
  ORDER BY m.client_id, m.created_at DESC
  LIMIT 25`;

export function callBackBucket(rows: CallBackRow[]): {
  label: string;
  count: number;
  href: Route;
  detail: string;
  tone: "danger" | "warning" | "default";
} {
  const names = rows.map((r) => r.name);
  return {
    label: CALL_BACK_LABEL,
    count: rows.length,
    href: (rows.length === 1 ? `/app/clients/${rows[0].client_id}` : "/app/clients") as Route,
    detail:
      rows.length === 0
        ? "No missed customer calls"
        : `Missed call${rows.length === 1 ? "" : "s"}: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`,
    tone: "danger",
  };
}
