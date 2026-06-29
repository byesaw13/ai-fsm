import { z } from "zod";
import type { Executor, Session } from "../types.js";
import { money } from "../money.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  invoice_number: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Invoice number, e.g. INV-0042"),
  invoice_id: z.string().uuid().optional().describe("Invoice UUID"),
};
const schema = z
  .object(inputShape)
  .refine((v) => Boolean(v.invoice_number) || Boolean(v.invoice_id), {
    message: "Provide invoice_number or invoice_id",
  });

type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  total_cents: number;
  paid_cents: number;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  client_name: string;
};

export async function run(exec: Executor, ctx: Session, input: unknown): Promise<unknown> {
  const { invoice_number, invoice_id } = schema.parse(input);

  const { rows } = invoice_id
    ? await exec.query<InvoiceRow>(
        `${BASE_SELECT} WHERE i.account_id = $1 AND i.id = $2 LIMIT 1`,
        [ctx.accountId, invoice_id],
      )
    : await exec.query<InvoiceRow>(
        `${BASE_SELECT} WHERE i.account_id = $1 AND i.invoice_number = $2 LIMIT 1`,
        [ctx.accountId, invoice_number],
      );

  const inv = rows[0];
  if (!inv) {
    throw new Error(`No invoice found for ${invoice_id ?? invoice_number}`);
  }

  const balanceCents = inv.total_cents - inv.paid_cents;
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    status: inv.status,
    client_name: inv.client_name,
    total: money(inv.total_cents),
    paid: money(inv.paid_cents),
    balance: money(balanceCents),
    is_paid: balanceCents <= 0,
    due_date: inv.due_date,
    sent_at: inv.sent_at,
    paid_at: inv.paid_at,
  };
}

const BASE_SELECT = `
  SELECT i.id, i.invoice_number, i.status, i.total_cents, i.paid_cents,
         i.due_date, i.sent_at, i.paid_at, c.name AS client_name
    FROM invoices i
    JOIN clients c ON c.id = i.client_id`;

export const tool: ToolModule = {
  name: "get_invoice_status",
  title: "Invoice status",
  description:
    "Look up one invoice by number (e.g. INV-0042) or UUID. Returns status, total, amount paid, and outstanding balance.",
  inputShape,
  run,
};

export default tool;
