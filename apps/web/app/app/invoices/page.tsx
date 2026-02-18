import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { withInvoiceContext } from "@/lib/invoices/db";
import type { InvoiceStatus } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

interface InvoiceRow {
  id: string;
  status: InvoiceStatus;
  invoice_number: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  due_date: string | null;
  created_at: string;
  client_name: string | null;
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

const STATUS_ORDER: InvoiceStatus[] = [
  "overdue",
  "sent",
  "partial",
  "draft",
  "paid",
  "void",
];

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const invoices = await withInvoiceContext(session, async (client) => {
    const r = await client.query(
      `SELECT i.id, i.status, i.invoice_number,
              i.subtotal_cents, i.tax_cents, i.total_cents, i.paid_cents,
              i.due_date, i.created_at,
              c.name AS client_name
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.account_id = $1
       ORDER BY i.created_at DESC
       LIMIT 100`,
      [session.accountId]
    );
    return r.rows as InvoiceRow[];
  });

  const grouped = STATUS_ORDER.reduce<Record<string, InvoiceRow[]>>(
    (acc, s) => ({ ...acc, [s]: [] }),
    {}
  );
  for (const inv of invoices) {
    grouped[inv.status]?.push(inv);
  }
  const activeStatuses = STATUS_ORDER.filter((s) => grouped[s].length > 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">{invoices.length} total</p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="empty-state" data-testid="invoices-empty">
          <p>No invoices yet. Convert an approved estimate to create one.</p>
        </div>
      ) : (
        <div className="status-sections">
          {activeStatuses.map((status) => (
            <section key={status} className="status-section">
              <h2 className="status-heading" data-status={status}>
                {STATUS_LABELS[status]}
                <span className="count-badge">{grouped[status].length}</span>
              </h2>
              <div className="job-list">
                {grouped[status].map((inv) => {
                  const amountDue = inv.total_cents - inv.paid_cents;
                  return (
                    <Link
                      key={inv.id}
                      href={{ pathname: `/app/invoices/${inv.id}` }}
                      className="job-card"
                      data-testid="invoice-card"
                      data-status={inv.status}
                    >
                      <div className="job-card-header">
                        <span className="job-title">
                          {inv.invoice_number}
                          {inv.client_name && ` — ${inv.client_name}`}
                        </span>
                        <span className={`status-pill status-${inv.status}`}>
                          {STATUS_LABELS[inv.status]}
                        </span>
                      </div>
                      <p className="job-client">
                        {formatDollars(inv.total_cents)}
                        {amountDue > 0 &&
                          amountDue !== inv.total_cents &&
                          ` (${formatDollars(amountDue)} due)`}
                      </p>
                      {inv.due_date && (
                        <p className="job-date">
                          Due: {new Date(inv.due_date).toLocaleDateString()}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
