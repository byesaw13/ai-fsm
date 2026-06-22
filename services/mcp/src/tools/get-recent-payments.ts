import { z } from "zod";
import type { Executor, Session } from "../types.js";
import { money } from "../money.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  limit: z.number().int().min(1).max(100).default(20).describe("Max results (1-100, default 20)"),
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "since must be YYYY-MM-DD")
    .optional()
    .describe("Only payments received on/after this date (YYYY-MM-DD)"),
};
const schema = z.object(inputShape);

type Row = {
  id: string;
  amount_cents: number;
  method: string;
  payment_type: string;
  received_at: string;
  paid_at: string | null;
  invoice_number: string;
  client_name: string;
};

export async function run(exec: Executor, ctx: Session, input: unknown): Promise<unknown> {
  const { limit, since } = schema.parse(input);
  const { rows } = await exec.query<Row>(
    `SELECT p.id, p.amount_cents, p.method, p.payment_type, p.received_at, p.paid_at,
            i.invoice_number, c.name AS client_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN clients c ON c.id = i.client_id
      WHERE p.account_id = $1
        AND p.status = 'paid'
        AND ($2::date IS NULL OR p.received_at >= $2::date)
      ORDER BY p.received_at DESC
      LIMIT $3`,
    [ctx.accountId, since ?? null, limit],
  );

  let total = 0;
  const payments = rows.map((r) => {
    total += r.amount_cents;
    return {
      id: r.id,
      amount: money(r.amount_cents),
      method: r.method,
      payment_type: r.payment_type,
      received_at: r.received_at,
      paid_at: r.paid_at,
      invoice_number: r.invoice_number,
      client_name: r.client_name,
    };
  });

  return { count: payments.length, total_received: money(total), payments };
}

export const tool: ToolModule = {
  name: "get_recent_payments",
  title: "Recent payments",
  description:
    "List completed payments (status paid), most recent first, across all channels (cash, check, Venmo, Zelle, ACH, card). Optionally bounded by a start date. Read-only — no Square or other write actions.",
  inputShape,
  run,
};

export default tool;
