import { z } from "zod";
import type { Executor, Session } from "../types.js";
import { money, durationMinutes, todayIso } from "../money.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional()
    .describe("Day to report on (YYYY-MM-DD). Defaults to today."),
};
const schema = z.object(inputShape);

type ActivityRow = {
  activity_type: string;
  category: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  entity_type: string | null;
  entity_id: string | null;
};
type VisitRow = {
  id: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  completed_at: string | null;
  job_title: string;
  client_name: string;
};
type PaymentRow = {
  amount_cents: number;
  method: string;
  payment_type: string;
  invoice_number: string;
  client_name: string;
};

export async function run(exec: Executor, ctx: Session, input: unknown): Promise<unknown> {
  const { date } = schema.parse(input);
  const day = date ?? todayIso();
  const acct = ctx.accountId;

  const [{ rows: activities }, { rows: visits }, { rows: payments }] = await Promise.all([
    exec.query<ActivityRow>(
      `SELECT activity_type, category, started_at, ended_at, note, entity_type, entity_id
         FROM activity_entries
        WHERE account_id = $1 AND session_date = $2 AND voided_at IS NULL
        ORDER BY started_at`,
      [acct, day],
    ),
    exec.query<VisitRow>(
      `SELECT v.id, v.status, v.scheduled_start, v.scheduled_end, v.completed_at,
              j.title AS job_title, c.name AS client_name
         FROM visits v
         JOIN jobs j ON j.id = v.job_id
         JOIN clients c ON c.id = j.client_id
        WHERE v.account_id = $1 AND v.scheduled_start::date = $2
        ORDER BY v.scheduled_start`,
      [acct, day],
    ),
    exec.query<PaymentRow>(
      `SELECT p.amount_cents, p.method, p.payment_type, i.invoice_number, c.name AS client_name
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         JOIN clients c ON c.id = i.client_id
        WHERE p.account_id = $1 AND p.status = 'paid' AND p.received_at::date = $2
        ORDER BY p.received_at`,
      [acct, day],
    ),
  ]);

  const byCategory: Record<string, number> = {};
  let totalMinutes = 0;
  const activityEntries = activities.map((a) => {
    const minutes = durationMinutes(a.started_at, a.ended_at);
    if (minutes !== null) {
      totalMinutes += minutes;
      byCategory[a.category] = (byCategory[a.category] ?? 0) + minutes;
    }
    return {
      activity_type: a.activity_type,
      category: a.category,
      started_at: a.started_at,
      ended_at: a.ended_at,
      duration_minutes: minutes,
      open: a.ended_at === null,
      note: a.note,
      entity: a.entity_type ? { type: a.entity_type, id: a.entity_id } : null,
    };
  });

  let paymentsTotal = 0;
  const paymentEntries = payments.map((p) => {
    paymentsTotal += p.amount_cents;
    return {
      amount: money(p.amount_cents),
      method: p.method,
      payment_type: p.payment_type,
      invoice_number: p.invoice_number,
      client_name: p.client_name,
    };
  });

  return {
    date: day,
    activities: {
      count: activityEntries.length,
      tracked_minutes: totalMinutes,
      minutes_by_category: byCategory,
      entries: activityEntries,
    },
    visits: {
      count: visits.length,
      completed: visits.filter((v) => v.status === "completed").length,
      entries: visits.map((v) => ({
        id: v.id,
        status: v.status,
        scheduled_start: v.scheduled_start,
        scheduled_end: v.scheduled_end,
        completed_at: v.completed_at,
        job_title: v.job_title,
        client_name: v.client_name,
      })),
    },
    payments: {
      count: paymentEntries.length,
      total_received: money(paymentsTotal),
      entries: paymentEntries,
    },
  };
}

export const tool: ToolModule = {
  name: "get_daily_operations_log",
  title: "Daily operations log",
  description:
    "What happened on a given day (default today): time-ledger activity entries with minutes by category, visits scheduled/completed, and payments received.",
  inputShape,
  run,
};

export default tool;
