import type { PoolClient } from "pg";
import { generateInvoiceNumber } from "./db";

/**
 * The one place invoices are created (TASK-247). Migration 218 backs the
 * duplicate rule with unique indexes:
 *   deposit          — one open deposit per estimate;
 *   final / standard — one open final-or-standard per job, one open final per estimate;
 *   progress         — no automatic dedupe (owner-chosen amounts).
 * "Open" means not void, so a voided invoice can be replaced.
 */

export type InvoiceKind = "deposit" | "progress" | "final" | "standard";

export type OpenInvoice = { id: string; invoice_number: string; status: string };

export async function findOpenInvoice(
  client: PoolClient,
  q: { kind: InvoiceKind; accountId: string; jobId?: string | null; estimateId?: string | null },
): Promise<OpenInvoice | null> {
  let where: string;
  let params: unknown[];
  if (q.kind === "deposit") {
    if (!q.estimateId) return null;
    where = `invoice_kind = 'deposit' AND estimate_id = $2`;
    params = [q.accountId, q.estimateId];
  } else if (q.kind === "final" || q.kind === "standard") {
    if (!q.jobId && !q.estimateId) return null;
    where = `((invoice_kind IN ('final', 'standard') AND job_id = $2)
              OR (invoice_kind = 'final' AND estimate_id = $3))`;
    params = [q.accountId, q.jobId ?? null, q.estimateId ?? null];
  } else {
    return null;
  }
  const res = await client.query<OpenInvoice>(
    `SELECT id, invoice_number, status FROM invoices
     WHERE account_id = $1 AND status <> 'void' AND ${where}
     ORDER BY created_at LIMIT 1`,
    params,
  );
  return res.rows[0] ?? null;
}

export type NewInvoice = {
  account_id: string;
  client_id: string;
  invoice_kind: InvoiceKind;
  created_by: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  job_id?: string | null;
  estimate_id?: string | null;
  property_id?: string | null;
  deposit_cents?: number;
  notes?: string | null;
  due_date?: string | null;
  travel_snapshot_id?: string | null;
  travel_billing_mode?: string | null;
  billing_context?: string;
  sponsored_purpose?: string | null;
  beneficiary_property_contact_id?: string | null;
  business_purpose?: string | null;
};

/**
 * Creates a draft invoice, or returns the open one that already fills that
 * slot (`created: false`). Callers decide what an existing one means
 * (idempotent return vs. a 409).
 */
export async function createInvoice(
  client: PoolClient,
  inv: NewInvoice,
): Promise<OpenInvoice & { created: boolean }> {
  const existing = await findOpenInvoice(client, {
    kind: inv.invoice_kind,
    accountId: inv.account_id,
    jobId: inv.job_id,
    estimateId: inv.estimate_id,
  });
  if (existing) return { ...existing, created: false };

  const invoice_number = await generateInvoiceNumber(client, inv.account_id);
  const row: Record<string, unknown> = { deposit_cents: 0, ...inv, invoice_number, status: "draft", paid_cents: 0 };
  // ponytail: a race between the check and the insert hits the 218 unique index and throws; fine at one office.
  const cols = Object.keys(row).filter((k) => row[k] !== undefined);
  const res = await client.query<{ id: string }>(
    `INSERT INTO invoices (${cols.join(", ")})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})
     RETURNING id`,
    cols.map((k) => row[k]),
  );
  return { id: res.rows[0].id, invoice_number, status: "draft", created: true };
}
