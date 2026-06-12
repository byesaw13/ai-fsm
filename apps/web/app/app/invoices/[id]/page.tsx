import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { LinkedDocuments } from "@/components/documents/LinkedDocuments";
import { canCreateInvoices, canRecordPayments } from "@/lib/auth/permissions";
import { withInvoiceContext } from "@/lib/invoices/db";
import { buildClientDocumentFilename, invoiceTransitions } from "@ai-fsm/domain";
import type { InvoiceStatus } from "@ai-fsm/domain";
import { InvoiceTransitionForm } from "./InvoiceTransitionForm";
import { RecordPaymentForm } from "./RecordPaymentForm";
import { PaymentHistory } from "./PaymentHistory";
import { InvoiceEditForm } from "./InvoiceEditForm";
import { MarkDepositReceivedButton } from "./MarkDepositReceivedButton";
import { SendInvoiceButton } from "./SendInvoiceButton";
import { InvoiceLineItemsEditor } from "./InvoiceLineItemsEditor";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  StatusStepper,
  Card,
  SectionHeader,
  LinkButton,
  EmptyState,
} from "@/components/ui";
import type { StatusVariant } from "@/components/ui";
import { isEmailConfigured } from "@/lib/email/mailer";
import { CopyPortalLinkButton } from "@/components/CopyPortalLinkButton";

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
  deposit_cents: number;
  balance_cents: number;
  deposit_paid_at: string | null;
  notes: string | null;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  share_token: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  client_email: string | null;
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
  line_item_type: "labor" | "materials" | "handling_fee" | "adjustment";
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
      `SELECT i.*, c.name AS client_name, c.email AS client_email, j.title AS job_title
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [id, session.accountId]
    );

    if (invoiceResult.rowCount === 0) return null;

    const lineItemsResult = await client.query(
      `SELECT id, invoice_id, estimate_line_item_id,
              description, quantity::float8 AS quantity, unit_price_cents, total_cents, line_item_type, sort_order, created_at
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
  // paid/partial are driven by RecordPaymentForm (payment trigger), not manual transition
  const allowedTransitions = invoiceTransitions[currentStatus].filter(
    (s) => s !== "paid" && s !== "partial" && (s !== "draft" || invoice.paid_cents === 0)
  );
  const canTransition = canCreateInvoices(session.role);
  const amountDue = invoice.total_cents - invoice.paid_cents;
  const depositPending = invoice.deposit_cents > 0 && !invoice.deposit_paid_at;
  const canMarkDeposit = canTransition && !["paid", "void"].includes(currentStatus);
  const canRecordPaymentAction = canRecordPayments(session.role) && ["sent", "partial", "overdue"].includes(currentStatus) && amountDue > 0;
  const canEditLineItems = canTransition && currentStatus === "draft";
  const documentFilename = buildClientDocumentFilename({
    date: invoice.sent_at ?? invoice.created_at,
    clientName: invoice.client_name,
    jobType: invoice.job_title ?? "Invoice",
    documentType: "invoice",
    status: currentStatus === "void" ? "archived" : currentStatus === "paid" ? "final" : currentStatus === "overdue" || currentStatus === "partial" ? "sent" : currentStatus,
  });

  return (
    <PageContainer>
      <PageHeader
        title={invoice.invoice_number}
        subtitle={invoice.client_name ?? undefined}
        backHref="/app/invoices"
        backLabel="Invoices"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <CopyPortalLinkButton
              url={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/invoices/${invoice.share_token}`}
              label="Copy client link"
            />
            <a
              href={`/api/v1/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="invoice-download-pdf"
              style={{
                display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
                padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)",
                color: "var(--fg)", textDecoration: "none", fontSize: "var(--text-sm)", fontWeight: 600,
              }}
            >
              Download PDF
            </a>
            <span data-testid="invoice-status">
              <StatusBadge variant={currentStatus as StatusVariant}>
                {STATUS_LABELS[currentStatus]}
              </StatusBadge>
            </span>
          </div>
        }
      />

      {/* Status Stepper — main path only */}
      {(["draft", "sent", "partial", "paid"] as InvoiceStatus[]).includes(currentStatus) && (
        <Card style={{ marginBottom: "var(--space-4)" }}>
          <StatusStepper
            steps={[
              { key: "draft", label: "Draft" },
              { key: "sent", label: "Sent" },
              { key: "partial", label: "Partial" },
              { key: "paid", label: "Paid" },
            ]}
            currentStep={currentStatus}
            data-testid="invoice-status-stepper"
          />
        </Card>
      )}

      {/* Detail layout */}
      <div className="p7-detail-layout">
        {/* LEFT: Line items + Payment history */}
        <div className="p7-detail-primary">
          <Card>
            <SectionHeader title="Line Items" />
            {canEditLineItems ? (
              <InvoiceLineItemsEditor
                invoiceId={invoice.id}
                jobId={invoice.job_id}
                lineItems={lineItems}
              />
            ) : lineItems.length === 0 ? (
              <EmptyState title="No line items" description="Line items will appear when this invoice is created from an estimate." />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }} data-testid="invoice-line-items-table">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Description</th>
                    <th style={{ width: 140, textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }} data-testid="invoice-line-item-row">
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>{item.description}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatDollars(item.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)" }}>
                    <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", fontWeight: 600 }}>Subtotal</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatDollars(invoice.subtotal_cents)}</td>
                  </tr>
                  {invoice.tax_cents > 0 && (
                    <tr>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>Tax</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatDollars(invoice.tax_cents)}</td>
                    </tr>
                  )}
                  <tr style={{ fontWeight: 700 }}>
                    <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>Total</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }} data-testid="invoice-total-footer">{formatDollars(invoice.total_cents)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Card>

          {/* Payment History */}
          {currentStatus !== "draft" && (
            <Card data-testid="payment-history-panel" id="payment-history-panel">
              <SectionHeader title="Payment History" />
              <PaymentHistory
                invoiceId={invoice.id}
                invoiceStatus={currentStatus}
                role={session.role}
              />
            </Card>
          )}
        </div>

        {/* RIGHT: Summary + Actions */}
        <div className="p7-detail-sidebar">
          {(currentStatus !== "draft" && currentStatus !== "void") && (
            <Card className="p7-card-accent" data-testid="invoice-closeout-card">
              <SectionHeader title="Invoice Closeout" />
              <dl className="p7-detail-list">
                <div className="p7-detail-row">
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge variant={currentStatus as StatusVariant}>
                      {STATUS_LABELS[currentStatus]}
                    </StatusBadge>
                  </dd>
                </div>
                <div className="p7-detail-row">
                  <dt>Remaining</dt>
                  <dd data-testid="invoice-closeout-remaining">{formatDollars(amountDue)}</dd>
                </div>
                {invoice.deposit_cents > 0 && (
                  <div className="p7-detail-row">
                    <dt>Deposit</dt>
                    <dd>
                      {formatDollars(invoice.deposit_cents)}
                      {invoice.deposit_paid_at ? (
                        <span style={{ marginLeft: "var(--space-2)", color: "var(--color-success, green)", fontSize: "var(--text-xs)" }}>
                          received
                        </span>
                      ) : (
                        <span style={{ marginLeft: "var(--space-2)", color: "var(--color-warning, orange)", fontSize: "var(--text-xs)" }}>
                          pending
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                {currentStatus === "paid"
                  ? "This invoice is closed out. Use the payment history if you need to audit the receipt trail."
                  : amountDue > 0
                    ? "Record the payment, then keep the payment history in one place while the balance clears."
                    : "The balance is clear. Keep the record for audit and closeout."}
              </p>
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
                {canRecordPaymentAction && (
                  <a href="#record-payment-panel" className="p7-btn p7-btn-primary p7-btn-sm">
                    Record Payment ↓
                  </a>
                )}
                <a href="#payment-history-panel" className="p7-btn p7-btn-secondary p7-btn-sm">
                  Payment History ↓
                </a>
                {invoice.estimate_id && (
                  <Link href={("/app/estimates/" + invoice.estimate_id) as Route} className="p7-btn p7-btn-secondary p7-btn-sm">
                    View Estimate
                  </Link>
                )}
              </div>
            </Card>
          )}
          {/* Summary */}
          <Card>
            <SectionHeader title="Summary" />
            <dl className="p7-detail-list">
              <div className="p7-detail-row">
                <dt>Total</dt>
                <dd style={{ fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)" }} data-testid="invoice-total">
                  {formatDollars(invoice.total_cents)}
                </dd>
              </div>
              <div className="p7-detail-row">
                <dt>Document filename</dt>
                <dd><code>{documentFilename}</code></dd>
              </div>
              {invoice.deposit_cents > 0 && (
                <div className="p7-detail-row">
                  <dt>Deposit due</dt>
                  <dd>
                    <span data-testid="invoice-deposit">{formatDollars(invoice.deposit_cents)}</span>
                    {invoice.deposit_paid_at ? (
                      <span style={{ marginLeft: "var(--space-2)", color: "var(--color-success, green)", fontSize: "var(--text-xs)" }}>
                        received {new Date(invoice.deposit_paid_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span style={{ marginLeft: "var(--space-2)", color: "var(--color-warning, orange)", fontSize: "var(--text-xs)" }}>
                        pending
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {invoice.balance_cents > 0 && (
                <div className="p7-detail-row">
                  <dt>Balance Due</dt>
                  <dd data-testid="invoice-balance">{formatDollars(invoice.balance_cents)}</dd>
                </div>
              )}
              {invoice.paid_cents > 0 && (
                <div className="p7-detail-row">
                  <dt>Paid</dt>
                  <dd data-testid="invoice-paid">{formatDollars(invoice.paid_cents)}</dd>
                </div>
              )}
              {amountDue > 0 && (
                <div className="p7-detail-row">
                  <dt>Remaining</dt>
                  <dd data-testid="invoice-due" style={{ color: amountDue > 0 ? "var(--color-danger)" : "var(--fg-base)" }}>
                    {formatDollars(amountDue)}
                  </dd>
                </div>
              )}
              {invoice.due_date && (
                <div className="p7-detail-row">
                  <dt>Due</dt>
                  <dd>{new Date(invoice.due_date).toLocaleDateString()}</dd>
                </div>
              )}
              {invoice.sent_at && (
                <div className="p7-detail-row">
                  <dt>Sent</dt>
                  <dd>{new Date(invoice.sent_at).toLocaleDateString()}</dd>
                </div>
              )}
              {invoice.paid_at && (
                <div className="p7-detail-row">
                  <dt>Paid on</dt>
                  <dd>{new Date(invoice.paid_at).toLocaleDateString()}</dd>
                </div>
              )}
              {invoice.job_title && (
                <div className="p7-detail-row">
                  <dt>Job</dt>
                  <dd>
                    <Link href={`/app/jobs/${invoice.job_id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                      {invoice.job_title}
                    </Link>
                  </dd>
                </div>
              )}
              {invoice.estimate_id && (
                <div className="p7-detail-row">
                  <dt>From Estimate</dt>
                  <dd>
                    <Link href={`/app/estimates/${invoice.estimate_id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                      View original estimate →
                    </Link>
                  </dd>
                </div>
              )}
              {invoice.notes && (
                <div className="p7-detail-row">
                  <dt>Notes</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{invoice.notes}</dd>
                </div>
              )}
            </dl>

            {canMarkDeposit && depositPending && (
              <div style={{ marginTop: "var(--space-3)" }}>
                <MarkDepositReceivedButton
                  invoiceId={invoice.id}
                  depositCents={invoice.deposit_cents}
                />
              </div>
            )}
          </Card>

          {/* Edit Invoice — owner/admin only, draft only */}
          {canTransition && currentStatus === "draft" && (
            <InvoiceEditForm
              invoiceId={invoice.id}
              initialNotes={invoice.notes}
              initialDueDate={invoice.due_date}
            />
          )}

          {/* Record Payment — owner/admin only, on payable invoices */}
          {canRecordPayments(session.role) &&
            ["sent", "partial", "overdue"].includes(currentStatus) &&
            amountDue > 0 && (
              <Card className="p7-card-accent" data-testid="record-payment-panel" id="record-payment-panel">
                <SectionHeader title="Record Payment" />
                <RecordPaymentForm
                  invoiceId={invoice.id}
                  remainingCents={amountDue}
                />
              </Card>
            )}

          {/* Send to Client — owner/admin only, non-terminal invoices */}
          {canTransition && currentStatus === "draft" && (
            <Card data-testid="send-invoice-card">
              <SectionHeader title="Send to Client" />
              <SendInvoiceButton
                invoiceId={invoice.id}
                clientEmail={invoice.client_email}
                sentAt={invoice.sent_at}
                emailConfigured={isEmailConfigured()}
              />
            </Card>
          )}

          {/* Status Transitions — owner/admin only */}
          {canTransition && allowedTransitions.length > 0 && (
            <Card data-testid="invoice-transition-panel">
              <SectionHeader title="Transition Status" />
              <InvoiceTransitionForm
                invoiceId={invoice.id}
                allowedTransitions={allowedTransitions as InvoiceStatus[]}
                statusLabels={STATUS_LABELS}
              />
            </Card>
          )}

          <LinkedDocuments session={session} entityType="invoice" entityId={invoice.id} />
        </div>
      </div>
    </PageContainer>
  );
}
