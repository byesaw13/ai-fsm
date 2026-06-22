import { z } from "zod";
import type { Executor, Session } from "../types.js";
import { money } from "../money.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  client_id: z.string().uuid().describe("Client UUID (from search_clients)"),
};
const schema = z.object(inputShape);

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
};
type CountRow = { c: number };
type JobStatusRow = { status: string; c: number };
type EstimateAggRow = { c: number; t: number };
type InvoiceAggRow = { c: number; balance: number };
type PaymentAggRow = { total: number; last: string | null };

export async function run(exec: Executor, ctx: Session, input: unknown): Promise<unknown> {
  const { client_id } = schema.parse(input);
  const acct = ctx.accountId;

  const { rows: clientRows } = await exec.query<ClientRow>(
    `SELECT id, name, email, phone, notes, created_at
       FROM clients WHERE id = $1 AND account_id = $2`,
    [client_id, acct],
  );
  const client = clientRows[0];
  if (!client) {
    throw new Error(`No client found with id ${client_id}`);
  }

  const [{ rows: propRows }, { rows: jobRows }, { rows: estRows }, { rows: invRows }, { rows: payRows }] =
    await Promise.all([
      exec.query<CountRow>(
        `SELECT COUNT(*)::int AS c FROM properties WHERE client_id = $1 AND account_id = $2`,
        [client_id, acct],
      ),
      exec.query<JobStatusRow>(
        `SELECT status, COUNT(*)::int AS c FROM jobs
          WHERE client_id = $1 AND account_id = $2 GROUP BY status`,
        [client_id, acct],
      ),
      exec.query<EstimateAggRow>(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(total_cents), 0)::int AS t
           FROM estimates
          WHERE client_id = $1 AND account_id = $2 AND status IN ('draft', 'sent')`,
        [client_id, acct],
      ),
      exec.query<InvoiceAggRow>(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(total_cents - paid_cents), 0)::int AS balance
           FROM invoices
          WHERE client_id = $1 AND account_id = $2 AND status IN ('sent', 'partial', 'overdue')`,
        [client_id, acct],
      ),
      exec.query<PaymentAggRow>(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS total, MAX(received_at) AS last
           FROM payments
          WHERE account_id = $2 AND status = 'paid'
            AND invoice_id IN (SELECT id FROM invoices WHERE client_id = $1 AND account_id = $2)`,
        [client_id, acct],
      ),
    ]);

  const jobsByStatus: Record<string, number> = {};
  let jobsTotal = 0;
  for (const row of jobRows) {
    jobsByStatus[row.status] = row.c;
    jobsTotal += row.c;
  }

  const estAgg = estRows[0] ?? { c: 0, t: 0 };
  const invAgg = invRows[0] ?? { c: 0, balance: 0 };
  const payAgg = payRows[0] ?? { total: 0, last: null };

  return {
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone,
      notes: client.notes,
      created_at: client.created_at,
    },
    properties: { count: propRows[0]?.c ?? 0 },
    jobs: { total: jobsTotal, by_status: jobsByStatus },
    open_estimates: { count: estAgg.c, total: money(estAgg.t) },
    unpaid_invoices: { count: invAgg.c, outstanding: money(invAgg.balance) },
    payments: { lifetime: money(payAgg.total), last_payment_at: payAgg.last },
  };
}

export const tool: ToolModule = {
  name: "get_client_summary",
  title: "Client summary",
  description:
    "A 360 snapshot for one client: contact info, property count, jobs by status, open estimate value, outstanding invoice balance, and lifetime payments.",
  inputShape,
  run,
};

export default tool;
