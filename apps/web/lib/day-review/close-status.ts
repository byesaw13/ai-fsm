import { queryForSession } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";
import { ACTIVITY_TYPE_META, type ActivityType } from "@ai-fsm/domain";
import { deriveDayCloseStatus } from "@/app/app/day-close/day-close-status";
import type { DayCloseStatusPayload } from "@/app/app/day-close/types";

export type DayCloseGateResult =
  | { ok: true }
  | { ok: false; reason: string; code: "CHECKLIST_INCOMPLETE" };

/** Server-side hard-blocker gate (payroll, activity, mileage). TASK-054. */
export async function assertDayCloseAllowed(
  session: SessionPayload,
  date: string,
): Promise<DayCloseGateResult> {
  const payload = await loadDayCloseStatus(session, date);
  const derived = deriveDayCloseStatus(payload);
  if (!derived.canClose) {
    return { ok: false, reason: derived.closeButtonHint, code: "CHECKLIST_INCOMPLETE" };
  }
  return { ok: true };
}

export async function loadDayCloseStatus(
  session: SessionPayload,
  date: string,
): Promise<DayCloseStatusPayload> {
  const [clockRows, activityRows, sessionRows, receiptRows, visitRows] = await Promise.all([
    queryForSession<{ status: string }>(
      session,
      `SELECT status FROM time_clock_sessions
       WHERE account_id = $1 AND user_id = $2 AND status = 'open' AND voided_at IS NULL
       ORDER BY clock_in_at DESC LIMIT 1`,
      [session.accountId, session.userId],
    ),
    queryForSession<{ id: string; activity_type: string }>(
      session,
      `SELECT id, activity_type FROM activity_entries
       WHERE account_id = $1 AND user_id = $2 AND ended_at IS NULL AND voided_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [session.accountId, session.userId],
    ),
    queryForSession<{ id: string; vehicle_nickname: string | null; start_odometer: number }>(
      session,
      `SELECT s.id, v.nickname AS vehicle_nickname, s.start_odometer
       FROM vehicle_sessions s LEFT JOIN vehicles v ON v.id = s.vehicle_id
       WHERE s.account_id = $1 AND s.session_date = $2::date
         AND s.end_odometer IS NULL AND s.miles IS NULL
       ORDER BY s.started_at DESC LIMIT 1`,
      [session.accountId, date],
    ),
    queryForSession<{ count: string }>(
      session,
      `SELECT COUNT(*)::text AS count FROM expenses
       WHERE account_id = $1 AND expense_date = $2::date
         AND receipt_url IS NULL`,
      [session.accountId, date],
    ),
    queryForSession<{ count: string }>(
      session,
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1 AND assigned_user_id = $3
         AND scheduled_start::date = $2::date
         AND status NOT IN ('cancelled')`,
      [session.accountId, date, session.userId],
    ),
  ]);

  const active = activityRows[0];
  const meta = active ? ACTIVITY_TYPE_META[active.activity_type as ActivityType] : null;

  return {
    clockOpen: clockRows[0]?.status === "open",
    activeActivity: active
      ? { id: active.id, activityType: active.activity_type, label: meta?.label ?? active.activity_type }
      : null,
    openSession: sessionRows[0]
      ? {
          id: sessionRows[0].id,
          vehicleName: sessionRows[0].vehicle_nickname,
          startOdometer: sessionRows[0].start_odometer,
        }
      : null,
    missingReceiptPhotos: parseInt(receiptRows[0]?.count ?? "0", 10),
    visitsToday: parseInt(visitRows[0]?.count ?? "0", 10),
    notesAcknowledged: false,
  };
}