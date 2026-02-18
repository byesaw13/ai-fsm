import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { canCreateInvoices, canRecordPayments } from "@/lib/auth/permissions";
import { withInvoiceContext } from "@/lib/invoices/db";
import { invoiceTransitions } from "@ai-fsm/domain";
import type { InvoiceStatus } from "@ai-fsm/domain";
import { InvoiceTransitionForm } from "./InvoiceTransitionForm";
import { RecordPaymentForm } from "./RecordPaymentForm";
import { PaymentHistory } from "./PaymentHistory";

export const dynamic = "force-dynamic";

interface InvoiceRow {
  id: string;
  account_id: string;
  client_id: string;
  job_id: string | null;
  estimate_id: string | null;
  property_id: string | null;
  status: InvoiceStatus;
  invoice_number: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  notes: string | null;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  job_title: string | null;
}

interface LineItemRow {
  id: string;
  invoice_id: string;
  estimate_line_item_id: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
  created_at: string;
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const result = await withInvoiceContext(session, async (client) => {
    const invoiceResult = await client.query(
      `SELECT i.*, c.name AS client_name, j.title AS job_title
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [id, session.accountId]
    );

    if (invoiceResult.rowCount === 0) return null;

    const lineItemsResult = await client.query(
      `SELECT id, invoice_id, estimate_line_item_id,
              description, quantity, unit_price_cents, total_cents, sort_order, created_at
       FROM invoice_line_items
       WHERE invoice_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [id]
    );

    return {
      invoice: invoiceResult.rows[0] as InvoiceRow,
      lineItems: lineItemsResult.rows as LineItemRow[],
    };
  });

  if (!result) notFound();

  const { invoice, lineItems } = result;
  const currentStatus = invoice.status;
  const allowedTransitions = invoiceTransitions[currentStatus];
  const canTransition = canCreateInvoices(session.role);
  const amountDue = invoice.total_cents - invoice.paid_cents;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Link href="/app/invoices" className="back-link">
            ← Invoices
          </Link>
          <h1 className="page-title">{invoice.invoice_number}</h1>
          {invoice.client_name && (
            <p className="page-subtitle">{invoice.client_name}</p>
          )}
        </div>
        <span
          className={`status-pill status-${invoice.status}`}
          data-testid="invoice-status"
        >
          {STATUS_LABELS[currentStatus]}
        </span>
      </div>

      {/* Summary */}
      <div className="card detail-card">
        <h2>Summary</h2>
        <p>
          <strong>Total:</strong>{" "}
          <span data-testid="invoice-total">{formatDollars(invoice.total_cents)}</span>
        </p>
        {invoice.paid_cents > 0 && (
          <p>
            <strong>Paid:</strong>{" "}
            <span data-testid="invoice-paid">{formatDollars(invoice.paid_cents)}</span>
          </p>
        )}
        {amountDue > 0 && (
          <p>
            <strong>Amount Due:</strong>{" "}
            <span data-testid="invoice-due">{formatDollars(amountDue)}</span>
          </p>
        )}
        {invoice.due_date && (
          <p>
            <strong>Due:</strong> {new Date(invoice.due_date).toLocaleDateString()}
          </p>
        )}
        {invoice.sent_at && (
          <p>
            <strong>Sent:</strong> {new Date(invoice.sent_at).toLocaleDateString()}
          </p>
        )}
        {invoice.paid_at && (
          <p>
            <strong>Paid on:</strong> {new Date(invoice.paid_at).toLocaleDateString()}
          </p>
        )}
        {invoice.job_title && (
          <p>
            <strong>Job:</strong> {invoice.job_title}
          </p>
        )}
        {invoice.estimate_id && (
          <p>
            <strong>From Estimate:</strong>{" "}
            <Link href={{ pathname: `/app/estimates/${invoice.estimate_id}` }}>
              View original estimate →
            </Link>
          </p>
        )}
        {invoice.notes && (
          <p>
            <strong>Notes:</strong> {invoice.notes}
          </p>
        )}
      </div>

      {/* Line Items */}
      <div className="card">
        <h2>Line Items</h2>
        {lineItems.length === 0 ? (
          <p className="muted" data-testid="invoice-line-items-empty">
            No line items.
          </p>
        ) : (
          <table className="line-items-table" data-testid="invoice-line-items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 120 }}>Unit Price</th>
                <th style={{ width: 100 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item: LineItemRow) => (
                <tr key={item.id} data-testid="invoice-line-item-row">
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{formatDollars(item.unit_price_cents)}</td>
                  <td>{formatDollars(item.total_cents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}></td>
                <td className="subtotal-label">
                  <strong>Subtotal</strong>
                </td>
                <td>{formatDollars(invoice.subtotal_cents)}</td>
              </tr>
              {invoice.tax_cents > 0 && (
                <tr>
                  <td colSpan={2}></td>
                  <td className="subtotal-label">Tax</td>
                  <td>{formatDollars(invoice.tax_cents)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={2}></td>
                <td className="subtotal-label">
                  <strong>Total</strong>
                </td>
                <td>
                  <strong data-testid="invoice-total-footer">
                    {formatDollars(invoice.total_cents)}
                  </strong>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Record Payment — owner/admin only, on payable invoices */}
      {canRecordPayments(session.role) &&
        ["sent", "partial", "overdue"].includes(currentStatus) &&
        amountDue > 0 && (
          <div className="card action-card" data-testid="record-payment-panel">
            <h2>Record Payment</h2>
            <RecordPaymentForm
              invoiceId={invoice.id}
              remainingCents={amountDue}
            />
          </div>
        )}

      {/* Payment History */}
      {currentStatus !== "draft" && (
        <div className="card" data-testid="payment-history-panel">
          <h2>Payment History</h2>
          <PaymentHistory invoiceId={invoice.id} />
        </div>
      )}

      {/* Status Transitions — owner/admin only */}
      {canTransition && allowedTransitions.length > 0 && (
        <div className="card action-card" data-testid="invoice-transition-panel">
          <h2>Transition Status</h2>
          <InvoiceTransitionForm
            invoiceId={invoice.id}
            allowedTransitions={allowedTransitions as InvoiceStatus[]}
            statusLabels={STATUS_LABELS}
          />
        </div>
      )}
    </div>
  );
}
