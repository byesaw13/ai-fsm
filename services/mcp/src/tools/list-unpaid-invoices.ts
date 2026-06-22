import { z } from "zod";
import type { Executor, Session } from "../types.js";
import { money } from "../money.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  client_id: z.string().uuid().optional().describe("Limit to a single client"),
  limit: z.number().int().min(1).max(100).default(50).describe("Max results (1-100, default 50)"),
};
const schema = z.object(inputShape);

type Row = {
  id: string;
  invoice_number: string;
  status: string;
  total_cents: number;
  paid_cents: number;
  due_date: string | null;
  sent_at: string | null;
  client_name: string;
};

function daysOverdue(dueDate: string | null, now: Date): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return null;
  const diff = Math.floor((now.getTime() - due) / 86400000);
  return diff > 0 ? diff : 0;
}

export async function run(exec: Executor, ctx: Session, input: unknown): Promise<unknown> {
  const { client_id, limit } = schema.parse(input);
  const { rows } = await exec.query<Row>(
    `SELECT i.id, i.invoice_number, i.status, i.total_cents, i.paid_cents,
            i.due_date, i.sent_at, c.name AS client_name
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
      WHERE i.account_id = $1
        AND i.status IN ('sent', 'partial', 'overdue')
        AND i.total_cents > i.paid_cents
        AND ($2::uuid IS NULL OR i.client_id = $2)
      ORDER BY i.due_date NULLS LAST, i.created_at
      LIMIT $3`,
    [ctx.accountId, client_id ?? null, limit],
  );

  const now = new Date();
  let totalOutstanding = 0;
  const invoices = rows.map((r) => {
    const balance = r.total_cents - r.paid_cents;
    totalOutstanding += balance;
    return {
      id: r.id,
      invoice_number: r.invoice_number,
      status: r.status,
      client_name: r.client_name,
      total: money(r.total_cents),
      paid: money(r.paid_cents),
      balance: money(balance),
      due_date: r.due_date,
      days_overdue: daysOverdue(r.due_date, now),
      sent_at: r.sent_at,
    };
  });

  return { count: invoices.length, total_outstanding: money(totalOutstanding), invoices };
}

export const tool: ToolModule = {
  name: "list_unpaid_invoices",
  title: "Unpaid invoices",
  description:
    "List invoices with an outstanding balance (status sent, partial, or overdue), oldest due date first. Optionally filter by client. Includes total outstanding and days overdue.",
  inputShape,
  run,
};

export default tool;
