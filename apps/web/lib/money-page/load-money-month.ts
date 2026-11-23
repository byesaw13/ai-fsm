import { groupMileageMonth, type MilesSource } from "@ai-fsm/domain";
import { queryForSession } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";
import { currentMonthKey } from "@/lib/expenses/ui";

/**
 * This month's spending and claim miles for the Money page (TASK-237).
 * Same month and the same rules as the Expenses and Mileage pages, so the
 * numbers match what those pages show.
 */
export async function loadMoneyMonth(session: SessionPayload): Promise<{
  spentCents: number;
  spentCount: number;
  claimMiles: number;
  monthLabel: string;
}> {
  const month = currentMonthKey();
  const [spent] = await queryForSession<{ total_cents: string | null; count: string }>(
    session,
    `SELECT SUM(amount_cents) AS total_cents, COUNT(*) AS count
       FROM expenses
      WHERE account_id = $1
        AND expense_date >= $2::date
        AND expense_date < ($2::date + interval '1 month')`,
    [session.accountId, `${month}-01`],
  );
  const sessions = await queryForSession<{
    id: string;
    session_date: string;
    miles: string | null;
    miles_source: MilesSource | null;
    status: string | null;
    start_odometer: number | null;
    end_odometer: number | null;
    notes: string | null;
    tagged: boolean;
  }>(
    session,
    `SELECT s.id, s.session_date::text,
            COALESCE(s.miles, s.end_odometer - s.start_odometer) AS miles,
            s.miles_source, s.status, s.start_odometer, s.end_odometer, s.notes,
            EXISTS (SELECT 1 FROM vehicle_session_activities a WHERE a.session_id = s.id) AS tagged
       FROM vehicle_sessions s
      WHERE s.account_id = $1
        AND to_char(s.session_date, 'YYYY-MM') = $2`,
    [session.accountId, month],
  );
  const summary = groupMileageMonth(
    sessions.map((s) => ({ ...s, miles: parseFloat(s.miles ?? "0") || 0 })),
  );
  const [y, m] = month.split("-");
  return {
    spentCents: parseInt(spent?.total_cents ?? "0", 10) || 0,
    spentCount: parseInt(spent?.count ?? "0", 10) || 0,
    claimMiles: summary.claimMiles,
    monthLabel: new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-US", { month: "long" }),
  };
}
