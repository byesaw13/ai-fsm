import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withInvoiceContext } from "@/lib/invoices/db";
import { buildClientDocumentFilename } from "@ai-fsm/domain";
import { DOCUMENT_STANDARD_VERSION, STANDARD_INVOICE_TERMS } from "@ai-fsm/domain";
import {
  brandingContactLines,
  resolveCompanyBranding,
  type CompanyProfileSettings,
} from "@/lib/company/branding";
import { DocumentPrintBar } from "@/components/documents/DocumentPrintBar";
import { PaidStamp } from "@/components/invoices/PaidStamp";
import { formatLineQuantityDisplay } from "@/lib/invoices/quantity";
import {
  documentJoins,
  documentLocationSelect,
  resolveServiceLocation,
} from "@/lib/documents/service-location";

export const dynamic = "force-dynamic";

interface InvoiceRow {
  id: string;
  status: string;
  invoice_number: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  paid_at: string | null;
  notes: string | null;
  due_date: string | null;
  sent_at: string | null;
  created_at: string;
  client_name: string | null;
  client_email: string | null;
  job_title: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  client_address_line1: string | null;
  client_city: string | null;
  client_state: string | null;
  client_zip: string | null;
  account_name: string;
  account_settings: CompanyProfileSettings;
}

interface LineItemRow {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const result = await withInvoiceContext(session, async (client) => {
    const invResult = await client.query(
      `SELECT
         i.id, i.status, i.invoice_number,
         i.subtotal_cents, i.tax_cents, i.total_cents, i.paid_cents, i.paid_at,
         i.notes, i.due_date, i.sent_at, i.created_at,
         j.title AS job_title,
         a.name AS account_name, a.settings AS account_settings,
         ${documentLocationSelect({ includeEstimateProperty: true })}
       FROM invoices i
       JOIN accounts a ON a.id = i.account_id
       ${documentJoins({ root: "i", includeEstimateProperty: true })}
       WHERE i.id = $1 AND i.account_id = $2`,
      [id, session.accountId],
    );
    if (invResult.rowCount === 0) return null;

    const liResult = await client.query(
      `SELECT id, description, quantity::float8 AS quantity, unit_price_cents, total_cents
       FROM invoice_line_items
       WHERE invoice_id = $1 AND visible_to_customer = true
       ORDER BY sort_order ASC, created_at ASC`,
      [id],
    );

    return {
      invoice: invResult.rows[0] as InvoiceRow,
      lineItems: liResult.rows as LineItemRow[],
    };
  });

  if (!result) notFound();

  const { invoice, lineItems } = result;
  const branding = resolveCompanyBranding(
    invoice.account_name,
    invoice.account_settings,
    session.accountId,
  );
  const contactLines = brandingContactLines(branding);
  const hasLogo = !!branding.logoPath;
  const balance = invoice.total_cents - invoice.paid_cents;
  const issuedDate = fmtDate(invoice.sent_at ?? invoice.created_at);
  const dueDate = fmtDate(invoice.due_date);
  const paymentTerms = branding.invoiceTerms || STANDARD_INVOICE_TERMS;
  const serviceLocation = resolveServiceLocation({
    property_address: invoice.property_address,
    property_city: invoice.property_city,
    property_state: invoice.property_state,
    property_zip: invoice.property_zip,
    client_address_line1: invoice.client_address_line1,
    client_city: invoice.client_city,
    client_state: invoice.client_state,
    client_zip: invoice.client_zip,
  });
  const isPaid =
    invoice.status === "paid" ||
    (invoice.total_cents > 0 && invoice.paid_cents >= invoice.total_cents);

  const fileStatus =
    invoice.status === "void"
      ? "archived"
      : invoice.status === "paid"
        ? "final"
        : invoice.status === "overdue" || invoice.status === "partial"
          ? "sent"
          : invoice.status;

  const documentFilename = buildClientDocumentFilename({
    date: invoice.sent_at ?? invoice.created_at,
    clientName: invoice.client_name,
    jobType: invoice.job_title ?? "Invoice",
    documentType: "invoice",
    status: fileStatus as "archived" | "final" | "sent" | "draft",
  });

  return (
    <>
      <style>{`
        /* Forest & Cedar — aligned with tokens.css + server PDF accents */
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        @media (max-width: 767px) {
          .wrap { padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }
        }
        body { font-family: Georgia, "Times New Roman", serif; color: #1c1917; background: #fff; margin: 0; }
        .wrap { max-width: 780px; margin: 0 auto; padding: 48px 40px; position: relative; }
        h1 { font-size: 28px; margin: 0; color: #1c1917; letter-spacing: -0.01em; }
        h2 { font-size: 13px; font-weight: 700; text-transform: uppercase;
             letter-spacing: 0.08em; color: #166534; margin: 36px 0 10px;
             border-bottom: 1.5px solid #166534; padding-bottom: 6px; }
        p { margin: 4px 0; line-height: 1.55; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; padding: 10px 10px; border-bottom: 2px solid #1c1917;
             font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
             color: #57534e; font-weight: 700; }
        td { padding: 10px; border-bottom: 1px solid #e7e5e4; font-size: 14px; vertical-align: top; }
        .amt { text-align: right; font-variant-numeric: tabular-nums; }
        tfoot td { font-weight: 600; border-top: 2px solid #1c1917; border-bottom: none; padding-top: 12px; }
        tfoot tr.total-row td { font-size: 16px; color: #166534; }
        .terms { font-size: 13px; color: #44403c; line-height: 1.65; white-space: pre-wrap; }
        .section-block { margin-top: 28px; }
        .header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 28px;
                      padding-bottom: 20px; border-bottom: 1.5px solid #166534; margin-bottom: 8px; }
        .letterhead { display: flex; gap: 16px; align-items: flex-start; }
        .company-name { font-size: 20px; font-weight: 700; color: #166534; }
        .meta-label { color: #57534e; font-size: 12px; }
        .meta-status { color: #166534; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
        .company-logo { max-height: 56px; max-width: 160px; object-fit: contain; }
        .bill-row { display: flex; gap: 48px; margin-top: 28px; }
        .footer-thanks { margin-top: 44px; font-size: 12px; color: #78716c; }
      `}</style>

      <DocumentPrintBar pdfUrl={`/api/v1/invoices/${id}/pdf`} />

      <div className="wrap">
        {isPaid && <PaidStamp paidAt={invoice.paid_at} />}
        <div className="header-row">
          <div className="letterhead">
            {hasLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/v1/account/logo?t=${encodeURIComponent(invoice.account_settings.logo_filename ?? "")}`}
                alt=""
                className="company-logo"
              />
            )}
            <div>
              <div className="company-name">{branding.name}</div>
              {branding.tagline && <p style={{ color: "#57534e", fontSize: 13, margin: "2px 0 0" }}>{branding.tagline}</p>}
              {contactLines.map((line) => (
                <p key={line} style={{ color: "#57534e", fontSize: 12, margin: "2px 0 0" }}>{line}</p>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h1>Invoice</h1>
            <p className="meta-label">{invoice.invoice_number}</p>
            <p className="meta-label no-print">{documentFilename}</p>
            <p className="meta-label">Document standard: {DOCUMENT_STANDARD_VERSION}</p>
            <p className="meta-label">Issued: {issuedDate}</p>
            {invoice.due_date && <p className="meta-label">Due: {dueDate}</p>}
            <p className="meta-label meta-status">{invoice.status}</p>
          </div>
        </div>

        <div className="bill-row">
          <div>
            <h2 style={{ margin: "0 0 8px" }}>Bill To</h2>
            <p style={{ fontWeight: 600 }}>{invoice.client_name ?? "—"}</p>
            {invoice.client_email && <p>{invoice.client_email}</p>}
          </div>
          <div>
            <h2 style={{ margin: "0 0 8px" }}>Service Location</h2>
            <p>{serviceLocation}</p>
          </div>
        </div>

        {invoice.job_title && (
          <div className="section-block">
            <h2>Job</h2>
            <p>{invoice.job_title}</p>
          </div>
        )}

        <div className="section-block">
          <h2>Line Items</h2>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ width: 60 }}>Qty</th>
                <th className="amt" style={{ width: 110 }}>Unit Price</th>
                <th className="amt" style={{ width: 110 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr><td colSpan={4} style={{ color: "#666" }}>No line items recorded.</td></tr>
              ) : (
                lineItems.map((item) => (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: "pre-line" }}>
                      {item.description.replace(/<!--travel-charge-->/g, "").trim()}
                    </td>
                    <td>{formatLineQuantityDisplay(item.quantity)}</td>
                    <td className="amt">{formatCents(item.unit_price_cents)}</td>
                    <td className="amt">{formatCents(item.total_cents)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Subtotal</td>
                <td className="amt">{formatCents(invoice.subtotal_cents)}</td>
              </tr>
              {invoice.tax_cents > 0 && (
                <tr>
                  <td colSpan={3}>Tax</td>
                  <td className="amt">{formatCents(invoice.tax_cents)}</td>
                </tr>
              )}
              <tr className="total-row">
                <td colSpan={3}>Total</td>
                <td className="amt">{formatCents(invoice.total_cents)}</td>
              </tr>
              {invoice.paid_cents > 0 && (
                <tr>
                  <td colSpan={3}>Paid</td>
                  <td className="amt">−{formatCents(invoice.paid_cents)}</td>
                </tr>
              )}
              <tr className="total-row">
                <td colSpan={3}>Balance Due</td>
                <td className="amt">{formatCents(balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {invoice.notes && (
          <div className="section-block">
            <h2>Notes</h2>
            <p className="terms">{invoice.notes}</p>
          </div>
        )}

        <div className="section-block">
          <h2>Payment Terms</h2>
          <p className="terms">{paymentTerms}</p>
        </div>

        <p className="footer-thanks">
          Thank you for your business. Please reference {invoice.invoice_number} with any payment.
        </p>
      </div>
    </>
  );
}