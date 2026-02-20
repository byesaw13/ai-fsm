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
  [key: string]: unknown;
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

function getDaysUntilDue(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatAging(days: number | null): string | null {
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `Due in ${days} days`;
  return null;
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
       ORDER BY 
         CASE i.status 
           WHEN 'overdue' THEN 1 
           WHEN 'partial' THEN 2 
           WHEN 'sent' THEN 3 
           ELSE 4 
         END,
         i.due_date ASC NULLS LAST
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

  const totalOutstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "partial" || i.status === "overdue")
    .reduce((sum, i) => sum + (i.total_cents - i.paid_cents), 0);

  const totalOverdue = grouped.overdue.reduce(
    (sum, i) => sum + (i.total_cents - i.paid_cents),
    0
  );

  const totalPaid = grouped.paid.reduce((sum, i) => sum + i.paid_cents, 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">{invoices.length} total</p>
        </div>
      </div>

      {invoices.length > 0 && (
        <div className="grid metrics-grid">
          <div className={`card metric-card ${totalOverdue > 0 ? "metric-alert" : ""}`}>
            <p className="muted">Outstanding</p>
            <p className="metric-value">{formatDollars(totalOutstanding)}</p>
            <p className="metric-sub">
              {grouped.sent.length + grouped.partial.length + grouped.overdue.length} unpaid
            </p>
          </div>
          <div className="card metric-card">
            <p className="muted">Overdue</p>
            <p className="metric-value">{formatDollars(totalOverdue)}</p>
            <p className="metric-sub">{grouped.overdue.length} invoices</p>
          </div>
          <div className="card metric-card metric-success">
            <p className="muted">Collected</p>
            <p className="metric-value">{formatDollars(totalPaid)}</p>
            <p className="metric-sub">{grouped.paid.length} paid</p>
          </div>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="empty-state" data-testid="invoices-empty">
          <div className="empty-state-icon">📄</div>
          <p className="empty-state-title">No invoices yet</p>
          <p className="empty-state-desc">Convert an approved estimate to create an invoice.</p>
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
                  const daysUntilDue = getDaysUntilDue(inv.due_date);
                  const aging = formatAging(daysUntilDue);
                  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
                  const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 7;

                  return (
                    <Link
                      key={inv.id}
                      href={{ pathname: `/app/invoices/${inv.id}` }}
                      className={`job-card ${isOverdue && inv.status !== 'overdue' ? 'overdue-card' : ''}`}
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
                      <div className="invoice-amounts">
                        <span className="invoice-total">{formatDollars(inv.total_cents)}</span>
                        {amountDue > 0 && amountDue !== inv.total_cents && (
                          <span className="invoice-due">{formatDollars(amountDue)} due</span>
                        )}
                      </div>
                      {inv.due_date && (
                        <p className={`job-date ${isOverdue ? 'text-danger' : isDueSoon ? 'text-warning' : ''}`}>
                          {aging || `Due: ${new Date(inv.due_date).toLocaleDateString()}`}
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
