import { z } from "zod";
import type { Executor, Session } from "../types.js";
import { money } from "../money.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  job_id: z.string().uuid().describe("Job UUID"),
};
const schema = z.object(inputShape);

type JobRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  created_at: string;
  client_id: string;
  client_name: string;
  property_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};
type VisitRow = {
  id: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  arrived_at: string | null;
  completed_at: string | null;
  assigned_user_id: string | null;
};
type EstimateRow = { id: string; status: string; total_cents: number };
type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  total_cents: number;
  paid_cents: number;
};

export async function run(exec: Executor, ctx: Session, input: unknown): Promise<unknown> {
  const { job_id } = schema.parse(input);
  const acct = ctx.accountId;

  const { rows: jobRows } = await exec.query<JobRow>(
    `SELECT j.id, j.title, j.description, j.status, j.priority, j.created_at,
            c.id AS client_id, c.name AS client_name,
            p.id AS property_id, p.address, p.city, p.state, p.zip
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
      WHERE j.id = $1 AND j.account_id = $2`,
    [job_id, acct],
  );
  const job = jobRows[0];
  if (!job) {
    throw new Error(`No job found with id ${job_id}`);
  }

  const [{ rows: visits }, { rows: estimates }, { rows: invoices }] = await Promise.all([
    exec.query<VisitRow>(
      `SELECT id, status, scheduled_start, scheduled_end, arrived_at, completed_at, assigned_user_id
         FROM visits WHERE job_id = $1 AND account_id = $2 ORDER BY scheduled_start`,
      [job_id, acct],
    ),
    exec.query<EstimateRow>(
      `SELECT id, status, total_cents FROM estimates WHERE job_id = $1 AND account_id = $2`,
      [job_id, acct],
    ),
    exec.query<InvoiceRow>(
      `SELECT id, invoice_number, status, total_cents, paid_cents
         FROM invoices WHERE job_id = $1 AND account_id = $2`,
      [job_id, acct],
    ),
  ]);

  const invoiced = invoices.reduce((s, i) => s + i.total_cents, 0);
  const paid = invoices.reduce((s, i) => s + i.paid_cents, 0);

  return {
    job: {
      id: job.id,
      title: job.title,
      description: job.description,
      status: job.status,
      priority: job.priority,
      created_at: job.created_at,
    },
    client: { id: job.client_id, name: job.client_name },
    property: job.property_id
      ? {
          id: job.property_id,
          address: job.address,
          city: job.city,
          state: job.state,
          zip: job.zip,
        }
      : null,
    visits: {
      // Visits are the scheduling source of truth (see core schema notes).
      count: visits.length,
      entries: visits.map((v) => ({
        id: v.id,
        status: v.status,
        scheduled_start: v.scheduled_start,
        scheduled_end: v.scheduled_end,
        arrived_at: v.arrived_at,
        completed_at: v.completed_at,
        assigned: Boolean(v.assigned_user_id),
      })),
    },
    estimates: {
      count: estimates.length,
      entries: estimates.map((e) => ({ id: e.id, status: e.status, total: money(e.total_cents) })),
    },
    invoices: {
      count: invoices.length,
      total_invoiced: money(invoiced),
      total_paid: money(paid),
      balance: money(invoiced - paid),
      entries: invoices.map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        status: i.status,
        total: money(i.total_cents),
        paid: money(i.paid_cents),
      })),
    },
  };
}

export const tool: ToolModule = {
  name: "get_job_summary",
  title: "Job summary",
  description:
    "Full picture of one job: details, client, property, scheduled/completed visits, linked estimates, and invoice billing totals.",
  inputShape,
  run,
};

export default tool;
