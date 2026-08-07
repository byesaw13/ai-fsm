/**
 * Vehicle maintenance + renewal reminders → attention_events (TASK-093).
 * Due calc from schedules/renewals; delivery via attention_events.dedupe_key.
 */
import type { Client } from "pg";
import { logger } from "./logger.js";

const SOON_DAYS = 30;
const SOON_MILES = 500;

type ScheduleRow = {
  account_id: string;
  vehicle_id: string;
  vehicle_nickname: string;
  service_type: string;
  interval_miles: number | null;
  interval_months: number | null;
  current_odometer: number | null;
  last_serviced_at: string | null;
  last_odometer: number | null;
};

type RenewalRow = {
  account_id: string;
  vehicle_id: string;
  vehicle_nickname: string;
  renewal_type: string;
  current_due_date: string;
};

function daysUntil(isoDate: string, today: Date): number {
  const due = new Date(`${isoDate}T12:00:00Z`).getTime();
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((due - t) / 86_400_000);
}

export async function runVehicleMaintenanceReminders(client: Client): Promise<{
  serviceReminders: number;
  renewalReminders: number;
  loanPayments: number;
}> {
  let serviceReminders = 0;
  let renewalReminders = 0;
  let loanPayments = 0;
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // Service schedules with last non-suspect completion
  const { rows: schedules } = await client.query<ScheduleRow>(
    `SELECT s.account_id, s.vehicle_id, v.nickname AS vehicle_nickname,
            s.service_type, s.interval_miles, s.interval_months,
            (
              SELECT MAX(vs.end_odometer) FROM vehicle_sessions vs
              WHERE vs.vehicle_id = s.vehicle_id AND vs.account_id = s.account_id
                AND vs.end_odometer IS NOT NULL
            ) AS current_odometer,
            last_r.serviced_at::text AS last_serviced_at,
            last_r.odometer AS last_odometer
     FROM vehicle_service_schedules s
     JOIN vehicles v ON v.id = s.vehicle_id AND v.account_id = s.account_id AND v.is_active
     LEFT JOIN LATERAL (
       SELECT r.serviced_at, r.odometer
       FROM vehicle_service_records r
       WHERE r.vehicle_id = s.vehicle_id AND r.account_id = s.account_id
         AND r.odometer_suspect = false
         AND s.service_type = ANY(r.service_types)
       ORDER BY r.serviced_at DESC
       LIMIT 1
     ) last_r ON true
     WHERE s.is_active = true`,
  );

  for (const s of schedules) {
    let overdue = false;
    let dueSoon = false;
    let title = `${s.vehicle_nickname}: ${s.service_type.replace(/_/g, " ")}`;
    let summary = "";

    if (s.interval_miles != null && s.last_odometer != null && s.current_odometer != null) {
      const dueOdo = s.last_odometer + s.interval_miles;
      const remaining = dueOdo - s.current_odometer;
      if (remaining < 0) {
        overdue = true;
        summary = `Overdue by ${Math.abs(remaining)} mi (due at ${dueOdo.toLocaleString()} mi)`;
      } else if (remaining <= SOON_MILES) {
        dueSoon = true;
        summary = `Due in ${remaining} mi (at ${dueOdo.toLocaleString()} mi)`;
      }
    }
    if (s.interval_months != null && s.last_serviced_at) {
      const last = new Date(`${s.last_serviced_at.slice(0, 10)}T12:00:00Z`);
      last.setUTCMonth(last.getUTCMonth() + s.interval_months);
      const dueDate = last.toISOString().slice(0, 10);
      const days = daysUntil(dueDate, today);
      if (days < 0) {
        overdue = true;
        summary = summary || `Overdue since ${dueDate}`;
      } else if (days <= SOON_DAYS) {
        dueSoon = true;
        summary = summary || `Due ${dueDate} (${days} days)`;
      }
    }

    if (!overdue && !dueSoon) continue;

    const window = overdue ? "overdue" : "soon";
    const dedupeKey = `vehicle_service_due:${s.vehicle_id}:${s.service_type}:${window}`;
    const exists = await client.query(
      `SELECT 1 FROM attention_events WHERE account_id = $1 AND dedupe_key = $2 LIMIT 1`,
      [s.account_id, dedupeKey],
    );
    if (exists.rows.length > 0) continue;
    await client.query(
      `INSERT INTO attention_events (
         account_id, type, entity_type, entity_id, title, summary, href, dedupe_key
       ) VALUES ($1, 'vehicle_service_due', 'vehicle', $2, $3, $4, $5, $6)`,
      [
        s.account_id,
        s.vehicle_id,
        title,
        summary || "Service due soon",
        `/app/mileage/vehicles/${s.vehicle_id}`,
        dedupeKey,
      ],
    );
    serviceReminders += 1;
  }

  // Renewals
  const { rows: renewals } = await client.query<RenewalRow>(
    `SELECT r.account_id, r.vehicle_id, v.nickname AS vehicle_nickname,
            r.renewal_type, r.current_due_date::text
     FROM vehicle_renewals r
     JOIN vehicles v ON v.id = r.vehicle_id AND v.account_id = r.account_id AND v.is_active
     WHERE r.is_active = true
       AND r.current_due_date <= ($1::date + ($2 || ' days')::interval)`,
    [todayIso, String(SOON_DAYS)],
  );

  for (const r of renewals) {
    const days = daysUntil(r.current_due_date, today);
    const window = days < 0 ? "overdue" : "soon";
    const dedupeKey = `vehicle_renewal_due:${r.vehicle_id}:${r.renewal_type}:${r.current_due_date}`;
    const exists = await client.query(
      `SELECT 1 FROM attention_events WHERE account_id = $1 AND dedupe_key = $2 LIMIT 1`,
      [r.account_id, dedupeKey],
    );
    if (exists.rows.length > 0) continue;
    await client.query(
      `INSERT INTO attention_events (
         account_id, type, entity_type, entity_id, title, summary, href, dedupe_key
       ) VALUES ($1, 'vehicle_renewal_due', 'vehicle', $2, $3, $4, $5, $6)`,
      [
        r.account_id,
        r.vehicle_id,
        `${r.vehicle_nickname}: ${r.renewal_type}`,
        days < 0
          ? `Overdue since ${r.current_due_date}`
          : `Due ${r.current_due_date} (${days} days)`,
        `/app/mileage/vehicles/${r.vehicle_id}`,
        dedupeKey,
      ],
    );
    renewalReminders += 1;
  }

  // Loan payments: one expense per active loan per calendar month
  const monthStart = `${todayIso.slice(0, 7)}-01`;
  const { rows: loans } = await client.query<{
    id: string;
    account_id: string;
    vehicle_id: string;
    lender: string;
    monthly_payment_cents: number;
    vehicle_nickname: string;
  }>(
    `SELECT l.id, l.account_id, l.vehicle_id, l.lender, l.monthly_payment_cents,
            v.nickname AS vehicle_nickname
     FROM vehicle_loans l
     JOIN vehicles v ON v.id = l.vehicle_id AND v.account_id = l.account_id
     WHERE l.is_active = true AND l.monthly_payment_cents > 0`,
  );

  for (const loan of loans) {
    const dedupeNote = `vehicle_loan_payment:${loan.id}:${todayIso.slice(0, 7)}`;
    const exists = await client.query(
      `SELECT 1 FROM expenses
       WHERE account_id = $1 AND vehicle_id = $2
         AND category = 'vehicle_loan_payment'
         AND expense_date >= $3::date
         AND notes = $4
       LIMIT 1`,
      [loan.account_id, loan.vehicle_id, monthStart, dedupeNote],
    );
    if (exists.rows.length > 0) continue;

    // Need a system user for created_by — use first owner
    const { rows: owners } = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE account_id = $1 AND role = 'owner' ORDER BY created_at LIMIT 1`,
      [loan.account_id],
    );
    const ownerId = owners[0]?.id;
    if (!ownerId) continue;

    await client.query(
      `INSERT INTO expenses (
         account_id, vendor_name, category, amount_cents, expense_date,
         notes, created_by, vehicle_id
       ) VALUES ($1, $2, 'vehicle_loan_payment', $3, $4::date, $5, $6, $7)`,
      [
        loan.account_id,
        loan.lender,
        loan.monthly_payment_cents,
        monthStart,
        dedupeNote,
        ownerId,
        loan.vehicle_id,
      ],
    );
    loanPayments += 1;
  }

  if (serviceReminders + renewalReminders + loanPayments > 0) {
    logger.info("vehicle-maintenance-reminder complete", {
      serviceReminders,
      renewalReminders,
      loanPayments,
    });
  }

  return { serviceReminders, renewalReminders, loanPayments };
}
