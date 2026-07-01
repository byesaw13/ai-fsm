import { queryForSession } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";
import { summarizeDayMileage, type VehicleSessionRow } from "@/lib/mileage/sessions";
import type { OpenSession, VehicleOption } from "@/app/app/WorkdayPanel";
import type { ActivityEntryDto } from "@/app/app/ActivityTracker";

export type FieldDayData = {
  todayLabel: string;
  openSession: OpenSession | null;
  vehicles: VehicleOption[];
  activityEntries: ActivityEntryDto[];
  dayMileage: ReturnType<typeof summarizeDayMileage>;
  yesterdayMiles: number;
  clockedIn: boolean;
  ownerPeek: { outstandingCents: number; draftInvoices: number } | null;
  locationSettings: { enabled: boolean; pausedUntil: string | null } | null;
};

export async function loadFieldDayData(
  session: SessionPayload,
  isOwner: boolean,
): Promise<FieldDayData> {
  const accountId = session.accountId;

  const [openSessionRows, fieldVehicles, fieldActivity, todaySessionRows, yesterdayMilesRows, clockRows] =
    await Promise.all([
      queryForSession<OpenSession>(
        session,
        `SELECT s.id, s.session_date::text, s.vehicle_id, v.nickname AS vehicle_nickname,
                v.plate AS vehicle_plate, s.start_odometer, s.started_at::text AS started_at
         FROM vehicle_sessions s LEFT JOIN vehicles v ON v.id = s.vehicle_id
         WHERE s.account_id = $1 AND s.session_date = CURRENT_DATE
           AND s.end_odometer IS NULL AND s.miles IS NULL
         ORDER BY s.started_at DESC LIMIT 1`,
        [accountId],
      ),
      queryForSession<VehicleOption>(
        session,
        `SELECT v.id, v.nickname, v.plate,
                last_s.end_odometer AS current_odometer
         FROM vehicles v
         LEFT JOIN LATERAL (
           SELECT end_odometer, session_date FROM vehicle_sessions
           WHERE vehicle_id = v.id AND account_id = v.account_id AND end_odometer IS NOT NULL
           ORDER BY session_date DESC, created_at DESC LIMIT 1
         ) last_s ON true
         WHERE v.account_id = $1 AND v.is_active = true
         ORDER BY v.nickname ASC`,
        [accountId],
      ),
      queryForSession<ActivityEntryDto>(
        session,
        `SELECT id, activity_type, category, started_at::text, ended_at::text,
                entity_type, entity_id, note
         FROM activity_entries
         WHERE account_id = $1 AND (session_date = CURRENT_DATE OR ended_at IS NULL) AND voided_at IS NULL
         ORDER BY started_at ASC`,
        [accountId],
      ),
      queryForSession<VehicleSessionRow>(
        session,
        `SELECT s.vehicle_id, v.nickname AS vehicle_nickname, v.plate AS vehicle_plate,
                s.start_odometer, s.end_odometer, s.miles::float8 AS miles
         FROM vehicle_sessions s LEFT JOIN vehicles v ON v.id = s.vehicle_id
         WHERE s.account_id = $1 AND s.session_date = CURRENT_DATE
         ORDER BY s.started_at ASC`,
        [accountId],
      ),
      queryForSession<{ count: string }>(
        session,
        `SELECT COALESCE(SUM(miles), 0)::text AS count
         FROM vehicle_sessions
         WHERE account_id = $1 AND session_date = CURRENT_DATE - interval '1 day'`,
        [accountId],
      ),
      queryForSession<{ status: string }>(
        session,
        `SELECT status FROM time_clock_sessions
         WHERE account_id = $1 AND user_id = $2 AND status = 'open' AND voided_at IS NULL
         ORDER BY clock_in_at DESC LIMIT 1`,
        [accountId, session.userId],
      ),
    ]);

  let ownerPeek: FieldDayData["ownerPeek"] = null;
  let locationSettings: FieldDayData["locationSettings"] = null;

  if (isOwner) {
    const settingsRows = await queryForSession<{ enabled: boolean; paused_until: string | null }>(
      session,
      `SELECT location_tracking_enabled AS enabled, location_paused_until::text AS paused_until
       FROM accounts WHERE id = $1`,
      [accountId],
    );
    locationSettings = settingsRows[0]
      ? { enabled: settingsRows[0].enabled, pausedUntil: settingsRows[0].paused_until }
      : null;

    const [outRows, draftRows] = await Promise.all([
      queryForSession<{ cents: string }>(
        session,
        `SELECT COALESCE(SUM(total_cents - paid_cents), 0)::text AS cents
         FROM invoices WHERE account_id = $1 AND status IN ('sent','partial','overdue')`,
        [accountId],
      ),
      queryForSession<{ count: string }>(
        session,
        `SELECT COUNT(*)::text AS count FROM invoices
         WHERE account_id = $1 AND status = 'draft' AND invoice_kind IN ('final','standard')`,
        [accountId],
      ),
    ]);
    ownerPeek = {
      outstandingCents: parseInt(outRows[0]?.cents ?? "0", 10),
      draftInvoices: parseInt(draftRows[0]?.count ?? "0", 10),
    };
  }

  return {
    todayLabel: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    openSession: openSessionRows[0] ?? null,
    vehicles: fieldVehicles,
    activityEntries: fieldActivity,
    dayMileage: summarizeDayMileage(todaySessionRows),
    yesterdayMiles: parseInt(yesterdayMilesRows[0]?.count ?? "0", 10),
    clockedIn: clockRows[0]?.status === "open",
    ownerPeek,
    locationSettings,
  };
}