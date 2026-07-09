import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { queryOneForSession } from "@/lib/db";
import { LinkedDocuments } from "@/components/documents/LinkedDocuments";
import { canCreateInvoices, canRecordPayments } from "@/lib/auth/permissions";
import { withInvoiceContext } from "@/lib/invoices/db";
import { buildClientDocumentFilename, invoiceTransitions } from "@ai-fsm/domain";
import type { InvoiceStatus } from "@ai-fsm/domain";
import { InvoiceTransitionForm } from "./InvoiceTransitionForm";
import { RecordPaymentForm } from "./RecordPaymentForm";
import { SquareLinkActions } from "./SquareLinkActions";
import { loadSquareSettings } from "@/lib/integrations/square-payments";
import { PaymentHistory } from "./PaymentHistory";
import { InvoiceEditForm } from "./InvoiceEditForm";
import { MarkDepositReceivedButton } from "./MarkDepositReceivedButton";
import { SendInvoiceButton } from "./SendInvoiceButton";
import { InvoiceLineItemsEditor } from "./InvoiceLineItemsEditor";
import { LinkForgottenExpensesPanel } from "@/components/invoices/LinkForgottenExpensesPanel";
import { MaterialHandlingPanel } from "./MaterialHandlingPanel";
import {
  DEFAULT_MATERIAL_HANDLING_PCT,
  materialHandlingRateFromSettings,
} from "@/lib/invoices/material-handling";
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
import { formatLineQuantityDisplay, parseLineQuantity } from "@/lib/invoices/quantity";
import { toDateOnly } from "@/lib/dates";
import {
  DOCUMENT_LOCATION_SELECT,
  documentJoins,
  resolveServiceLocation,
} from "@/lib/documents/service-location";

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
  square_payment_link_url: string | null;
  deposit_paid_at: string | null;
  notes: string | null;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  share_token: string;
  apply_material_handling: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address_line1: string | null;
  client_city: string | null;
  client_state: string | null;
  client_zip: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
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
      `SELECT i.*, j.title AS job_title,
              ${DOCUMENT_LOCATION_SELECT}
       FROM invoices i
       ${documentJoins({ root: "i", includeEstimateProperty: true })}
       WHERE i.id = $1 AND i.account_id = $2`,
      [id, session.accountId]
    );

    if (invoiceResult.rowCount === 0) return null;

    const accountResult = await client.query<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM accounts WHERE id = $1`,
      [session.accountId],
    );

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
      accountSettings: accountResult.rows[0]?.settings ?? {},
      lineItems: lineItemsResult.rows.map((row) => ({
        ...(row as LineItemRow),
        quantity: parseLineQuantity((row as LineItemRow).quantity),
      })),
    };
  });

  if (!result) notFound();

  const { invoice, lineItems, accountSettings } = result;
  const serviceLocation = resolveServiceLocation({
    property_address: invoice.property_address as string | null,
    property_city: invoice.property_city as string | null,
    property_state: invoice.property_state as string | null,
    property_zip: invoice.property_zip as string | null,
    client_address_line1: invoice.client_address_line1 as string | null,
    client_city: invoice.client_city as string | null,
    client_state: invoice.client_state as string | null,
    client_zip: invoice.client_zip as string | null,
  });
  const handlingPct = Math.round(
    materialHandlingRateFromSettings(accountSettings) * 100,
  ) || DEFAULT_MATERIAL_HANDLING_PCT;
  const materialSubtotalCents = lineItems
    .filter((item) => item.line_item_type === "materials")
    .reduce((sum, item) => sum + item.total_cents, 0);

  const sourceVisit =
    (await queryOneForSession<{ id: string; visit_type: string; completed_at: string }>(
      session,
      `SELECT v.id, v.visit_type, v.completed_at::text
       FROM invoices i
       JOIN visits v ON v.id = i.source_visit_id
       WHERE i.id = $1 AND i.account_id = $2`,
      [id, session.accountId],
    )) ??
    (invoice.job_id
      ? await queryOneForSession<{ id: string; visit_type: string; completed_at: string }>(
          session,
          `SELECT v.id, v.visit_type, v.completed_at::text
           FROM visits v
           WHERE v.job_id = $1 AND v.account_id = $2
             AND v.status = 'completed'
             AND v.completed_at::date = $3::date
           ORDER BY v.completed_at DESC
           LIMIT 1`,
          [invoice.job_id, session.accountId, toDateOnly(invoice.created_at)],
        )
      : null);

  const currentStatus = invoice.status;
  // paid/partial are driven by RecordPaymentForm (payment trigger), not manual transition
  const allowedTransitions = invoiceTransitions[currentStatus].filter(
    (s) => s !== "paid" && s !== "partial" && (s !== "draft" || invoice.paid_cents === 0)
  );
  const canTransition = canCreateInvoices(session.role);
  // Keep amountDue aligned with the payment/status logic (which currently
  // compares paid_cents against total_cents in validatePaymentAmount,
  // deriveInvoiceStatus, and trg_payment_sync_invoice). Using balance_cents
  // here can produce amountDue===0 (or negative) while the invoice is still
  // treated as "partial" by the backend, hiding the record-payment UI.
  // TODO: when payment logic migrates to balance_cents, switch this back
  // and update the callers.
  const amountDue = Math.max(0, invoice.total_cents - invoice.paid_cents);
  const depositPending = invoice.deposit_cents > 0 && !invoice.deposit_paid_at;
  const canMarkDeposit = canTransition && !["paid", "void"].includes(currentStatus);
  const canRecordPaymentAction = canRecordPayments(session.role) && ["sent", "partial", "overdue"].includes(currentStatus) && amountDue > 0;

  // Square link actions: owner/admin only, on payable invoices, when Square is
  // enabled. Settings are RLS-restricted to owner/admin so techs never load it.
  let squareEnabled = false;
  if (canRecordPaymentAction && (session.role === "owner" || session.role === "admin")) {
    const sq = await withInvoiceContext(session, (client) =>
      loadSquareSettings(client, session.accountId)
    );
    squareEnabled = !!sq?.enabled && !!sq?.config.locationId && !!sq?.secrets.accessToken;
  }
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
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <CopyPortalLinkButton
              url={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/invoices/${invoice.share_token}`}
              label="Copy link"
            />
            <Link
              href={`/app/invoices/${invoice.id}/print` as Route}
              target="_blank"
              className="p7-btn p7-btn-secondary p7-btn-sm"
              style={{ textDecoration: "none" }}
            >
              Print
            </Link>
            <a
              href={`/api/v1/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="invoice-download-pdf"
              className="p7-btn p7-btn-secondary p7-btn-sm"
              style={{ textDecoration: "none" }}
            >
              PDF
            </a>
            <span data-testid="invoice-status">
              <StatusBadge variant={currentStatus as StatusVariant}>
                {STATUS_LABELS[currentStatus]}
              </StatusBadge>
            </span>
          </div>
        }
      />

      {/* Trustworthy money bar — always visible, the point of an invoice */}
      <div className="p7-invoice-money-bar" style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--space-4)",
        alignItems: "flex-end",
        marginBottom: "var(--space-4)",
        paddingBottom: "var(--space-4)",
        borderBottom: "1px solid var(--border)"
      }}>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontWeight: 600, letterSpacing: "0.04em" }}>TOTAL</div>
          <div style={{ fontSize: "clamp(1.25rem, 5vw, 2rem)", fontWeight: 700, fontFamily: "var(--font-mono)", lineHeight: 1 }} data-testid="invoice-total">
            {formatDollars(invoice.total_cents)}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontWeight: 600, letterSpacing: "0.04em" }}>BALANCE DUE</div>
          <div
            style={{
              fontSize: "clamp(1.25rem, 5vw, 2rem)",
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              lineHeight: 1,
              color: amountDue > 0 ? "var(--color-danger)" : "var(--fg)"
            }}
            data-testid="invoice-balance"
          >
            {formatDollars(amountDue)}
          </div>
          {amountDue > 0 && currentStatus !== "draft" && (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)", marginTop: 2 }}>Client owes this now</div>
          )}
        </div>

        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontWeight: 600, letterSpacing: "0.04em" }}>PAID</div>
          <div style={{ fontSize: "clamp(1rem, 4vw, 1.5rem)", fontWeight: 600, fontFamily: "var(--font-mono)" }} data-testid="invoice-paid">
            {formatDollars(invoice.paid_cents)}
          </div>
        </div>

        {invoice.deposit_cents > 0 && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Deposit</div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {formatDollars(invoice.deposit_cents)}
              {invoice.deposit_paid_at ? " ✓" : " (pending)"}
            </div>
          </div>
        )}
      </div>

      {/* Status Stepper */}
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

      {/* Line items — full width so qty/unit/amount columns stay visible (matches PDF layout) */}
      <Card style={{ marginBottom: "var(--space-4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
          <SectionHeader title="Line Items" />
          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            {lineItems.length} lines · {formatDollars(invoice.subtotal_cents)} subtotal
          </div>
        </div>

        {canEditLineItems ? (
          <>
            <MaterialHandlingPanel
              invoiceId={invoice.id}
              initialEnabled={invoice.apply_material_handling ?? true}
              handlingPct={handlingPct}
              materialSubtotalCents={materialSubtotalCents}
            />
            {invoice.job_id && (
              <LinkForgottenExpensesPanel
                mode="invoice"
                invoiceId={invoice.id}
                jobId={invoice.job_id}
                handlingPct={handlingPct}
              />
            )}
            <InvoiceLineItemsEditor
              invoiceId={invoice.id}
              jobId={invoice.job_id}
              lineItems={lineItems}
            />
          </>
        ) : lineItems.length === 0 ? (
          <EmptyState title="No line items" description="Line items are usually pulled from an approved estimate." />
        ) : (
          <div className="p7-table-wrapper p7-invoice-line-items">
            <table className="p7-table" data-testid="invoice-line-items-table">
              <thead>
                <tr>
                  <th className="p7-col-desc">Description</th>
                  <th className="p7-col-type">Type</th>
                  <th className="p7-col-qty" style={{ textAlign: "right" }}>Qty</th>
                  <th className="p7-col-price" style={{ textAlign: "right" }}>Unit Price</th>
                  <th className="p7-col-amount" style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.id} data-testid="invoice-line-item-row">
                    <td className="p7-col-desc">{item.description}</td>
                    <td className="p7-col-type">
                      <span className="p7-badge p7-badge-count" style={{ fontSize: "10px" }}>
                        {item.line_item_type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p7-col-qty" style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      {formatLineQuantityDisplay(item.quantity)}
                    </td>
                    <td className="p7-col-price" style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      {formatDollars(item.unit_price_cents)}
                    </td>
                    <td className="p7-col-amount" style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                      {formatDollars(item.total_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={4} style={{ textAlign: "right", fontWeight: 600 }}>Subtotal</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{formatDollars(invoice.subtotal_cents)}</td>
                </tr>
                {invoice.tax_cents > 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "right" }}>Tax</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{formatDollars(invoice.tax_cents)}</td>
                  </tr>
                )}
                <tr style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>
                  <td colSpan={4} style={{ textAlign: "right" }}>Total</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }} data-testid="invoice-total-footer">
                    {formatDollars(invoice.total_cents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Two-column detail */}
      <div className="p7-detail-layout">
        {/* Primary: payment history */}
        <div className="p7-detail-primary">
          {/* Payment History — visible and direct once invoiced */}
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

        {/* Sidebar controls + facts */}
        <div className="p7-detail-sidebar">
          {/* Financial breakdown (always honest) */}
          <Card>
            <SectionHeader title="Financials" />
            <div style={{ display: "grid", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Subtotal</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{formatDollars(invoice.subtotal_cents)}</span>
              </div>
              {invoice.tax_cents > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Tax</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{formatDollars(invoice.tax_cents)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)" }}>
                <span>Total</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{formatDollars(invoice.total_cents)}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "var(--space-1)" }}>
                <span>Paid to date</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-success)" }}>-{formatDollars(invoice.paid_cents)}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "var(--text-base)", color: amountDue > 0 ? "var(--color-danger)" : "var(--fg)" }}>
                <span>Balance remaining</span>
                <span style={{ fontFamily: "var(--font-mono)" }} data-testid="invoice-due">{formatDollars(amountDue)}</span>
              </div>
            </div>

            {canMarkDeposit && depositPending && (
              <div style={{ marginTop: "var(--space-3)" }}>
                <MarkDepositReceivedButton invoiceId={invoice.id} depositCents={invoice.deposit_cents} />
              </div>
            )}
          </Card>

          {/* Primary actions — grouped by intent */}
          {currentStatus === "draft" && canTransition && (
            <Card>
              <SectionHeader title="Next" />
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <SendInvoiceButton
                  invoiceId={invoice.id}
                  clientEmail={invoice.client_email}
                  sentAt={invoice.sent_at}
                  emailConfigured={isEmailConfigured()}
                />
                <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", margin: "var(--space-1) 0 0" }}>
                  Draft invoices can still be edited. Send when the numbers are locked.
                </p>
              </div>
            </Card>
          )}

          {/* Record payment / refund (the money action) */}
          {canRecordPayments(session.role) &&
            ((["sent", "partial", "overdue"].includes(currentStatus) && amountDue > 0) || currentStatus === "paid") && (
              <Card className="p7-card-accent" id="record-payment-panel" data-testid="record-payment-panel">
                <SectionHeader title={currentStatus === "paid" ? "Refund or Adjustment" : "Record Payment"} />
                {currentStatus === "paid" && (
                  <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    Use Refund to log money returned.
                  </p>
                )}
                <RecordPaymentForm invoiceId={invoice.id} remainingCents={amountDue} />
              </Card>
            )}

          {/* Square online pay link */}
          {squareEnabled && (
            <Card>
              <SectionHeader title="Online Payment" />
              <SquareLinkActions
                invoiceId={invoice.id}
                hasDeposit={invoice.deposit_cents > 0}
                remainingCents={amountDue}
                existingLinkUrl={invoice.square_payment_link_url}
              />
            </Card>
          )}

          {/* Status transitions for non-payment moves */}
          {canTransition && allowedTransitions.length > 0 && (
            <Card>
              <SectionHeader title="Status" />
              <InvoiceTransitionForm
                invoiceId={invoice.id}
                allowedTransitions={allowedTransitions as InvoiceStatus[]}
                statusLabels={STATUS_LABELS}
              />
            </Card>
          )}

          <Card>
            <SectionHeader title="Client & Location" />
            <dl className="p7-detail-list" style={{ fontSize: "var(--text-sm)" }}>
              <div className="p7-detail-row">
                <dt>Client</dt>
                <dd style={{ fontWeight: 600 }}>{invoice.client_name ?? "—"}</dd>
              </div>
              {invoice.client_email && (
                <div className="p7-detail-row">
                  <dt>Email</dt>
                  <dd>{invoice.client_email}</dd>
                </div>
              )}
              <div className="p7-detail-row">
                <dt>Service location</dt>
                <dd>{serviceLocation}</dd>
              </div>
            </dl>
          </Card>

          {/* Secondary facts + edit */}
          <Card>
            <SectionHeader title="Details" />
            <dl className="p7-detail-list" style={{ fontSize: "var(--text-sm)" }}>
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
              {invoice.job_title && (
                <div className="p7-detail-row">
                  <dt>Project</dt>
                  <dd>
                    <Link href={`/app/jobs/${invoice.job_id}`} style={{ color: "var(--accent)" }}>
                      {invoice.job_title}
                    </Link>
                  </dd>
                </div>
              )}
              {sourceVisit && (
                <div className="p7-detail-row">
                  <dt>From visit</dt>
                  <dd>
                    <Link href={`/app/visits/${sourceVisit.id}`} style={{ color: "var(--accent)" }}>
                      {sourceVisit.visit_type.replace(/_/g, " ")}
                      {sourceVisit.completed_at
                        ? ` · ${new Date(sourceVisit.completed_at).toLocaleDateString()}`
                        : ""}
                    </Link>
                  </dd>
                </div>
              )}

              {invoice.estimate_id && (
                <div className="p7-detail-row">
                  <dt>From</dt>
                  <dd>
                    <Link href={`/app/estimates/${invoice.estimate_id}`} style={{ color: "var(--accent)" }}>
                      Estimate
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
              <div className="p7-detail-row">
                <dt>File</dt>
                <dd><code style={{ fontSize: "11px" }}>{documentFilename}</code></dd>
              </div>
            </dl>

            {canTransition && currentStatus === "draft" && (
              <div style={{ marginTop: "var(--space-3)" }}>
                <InvoiceEditForm
                  invoiceId={invoice.id}
                  initialNotes={invoice.notes}
                  initialDueDate={invoice.due_date}
                />
              </div>
            )}
          </Card>

          <LinkedDocuments session={session} entityType="invoice" entityId={invoice.id} />
        </div>
      </div>
    </PageContainer>
  );
}
