/**
 * Loaders that fetch a document + its line items and render a PDF.
 * Shared by the email-send routes (attachment) and the download endpoints,
 * so both produce byte-identical PDFs.
 *
 * Each loader takes an already-scoped pg client (RLS context set by the
 * caller via withInvoiceContext / withEstimateContext).
 */
import type { PoolClient } from "pg";
import { buildClientDocumentFilename } from "@ai-fsm/domain";
import {
  resolveCompanyBranding,
  type CompanyProfileSettings,
} from "@/lib/company/branding";
import {
  buildInvoicePdf,
  buildEstimatePdf,
  type PdfLineItem,
  type EstimateOptionGroup,
  type PdfBranding,
} from "./document-pdf";

export interface LoadedPdf {
  filename: string;
  bytes: Uint8Array;
  clientId: string;
  clientEmail: string | null;
  ref: string;
}

function mapLineItems(rows: Array<Record<string, unknown>>): PdfLineItem[] {
  return rows.map((r) => ({
    description: String(r.description ?? ""),
    quantity: Number(r.quantity ?? 0),
    unitPriceCents: Number(r.unit_price_cents ?? 0),
    totalCents: Number(r.total_cents ?? 0),
  }));
}

function brandingFromAccount(
  accountName: string,
  settings: unknown,
  accountId: string
): PdfBranding {
  const b = resolveCompanyBranding(
    accountName,
    settings as CompanyProfileSettings | null,
    accountId
  );
  return {
    name: b.name,
    tagline: b.tagline,
    address: b.address,
    phone: b.phone,
    email: b.email,
    website: b.website,
    logoPath: b.logoPath,
    invoiceTerms: b.invoiceTerms,
    estimateTerms: b.estimateTerms,
  };
}

/** Filename status bucket — mirrors the invoice/estimate detail pages. */
function invoiceFileStatus(status: string): string {
  if (status === "void") return "archived";
  if (status === "paid") return "final";
  if (status === "overdue" || status === "partial") return "sent";
  return status;
}

export async function loadInvoicePdf(
  client: PoolClient,
  accountId: string,
  id: string,
): Promise<LoadedPdf | null> {
  const { rows, rowCount } = await client.query(
    `SELECT i.id, i.invoice_number, i.status, i.subtotal_cents, i.tax_cents,
            i.total_cents, i.paid_cents, i.due_date, i.notes, i.sent_at, i.created_at,
            c.id AS client_id, c.name AS client_name, c.email AS client_email,
            j.title AS job_title,
            p.address AS property_address,
            a.name AS account_name, a.settings AS account_settings
     FROM invoices i
     JOIN clients c ON c.id = i.client_id
     JOIN accounts a ON a.id = i.account_id
     LEFT JOIN jobs j ON j.id = i.job_id
     LEFT JOIN properties p ON p.id = i.property_id
     WHERE i.id = $1 AND i.account_id = $2`,
    [id, accountId],
  );
  if (!rowCount) return null;
  const inv = rows[0];

  // Match the customer portal: never expose internal-only line items.
  const lineItems = await client.query(
    `SELECT description, quantity, unit_price_cents, total_cents
     FROM invoice_line_items WHERE invoice_id = $1
       AND visible_to_customer = true
     ORDER BY sort_order ASC, created_at ASC`,
    [id],
  );

  const branding = brandingFromAccount(
    String(inv.account_name ?? ""),
    inv.account_settings,
    accountId
  );

  const bytes = await buildInvoicePdf({
    invoiceNumber: String(inv.invoice_number),
    status: String(inv.status),
    clientName: inv.client_name as string | null,
    clientEmail: inv.client_email as string | null,
    jobTitle: inv.job_title as string | null,
    propertyAddress: inv.property_address as string | null,
    issueDate: (inv.sent_at ?? inv.created_at) as string | null,
    dueDate: inv.due_date as string | null,
    subtotalCents: Number(inv.subtotal_cents ?? 0),
    taxCents: Number(inv.tax_cents ?? 0),
    totalCents: Number(inv.total_cents ?? 0),
    paidCents: Number(inv.paid_cents ?? 0),
    notes: inv.notes as string | null,
    lineItems: mapLineItems(lineItems.rows),
    branding,
  });

  const filename = buildClientDocumentFilename({
    date: (inv.sent_at ?? inv.created_at) as string,
    clientName: inv.client_name as string | null,
    jobType: (inv.job_title as string | null) ?? "Invoice",
    documentType: "invoice",
    status: invoiceFileStatus(String(inv.status)) as never,
  });

  return {
    filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
    bytes,
    clientId: String(inv.client_id),
    clientEmail: inv.client_email as string | null,
    ref: String(inv.invoice_number),
  };
}

export async function loadEstimatePdf(
  client: PoolClient,
  accountId: string,
  id: string,
): Promise<LoadedPdf | null> {
  const { rows, rowCount } = await client.query(
    `SELECT e.id, e.status, e.presentation_mode, e.subtotal_cents, e.tax_cents, e.total_cents,
            e.deposit_cents, e.expires_at, e.notes, e.sent_at, e.created_at,
            c.id AS client_id, c.name AS client_name, c.email AS client_email,
            j.title AS job_title,
            p.address AS property_address,
            a.name AS account_name, a.settings AS account_settings
     FROM estimates e
     JOIN clients c ON c.id = e.client_id
     JOIN accounts a ON a.id = e.account_id
     LEFT JOIN jobs j ON j.id = e.job_id
     LEFT JOIN properties p ON p.id = e.property_id
     WHERE e.id = $1 AND e.account_id = $2`,
    [id, accountId],
  );
  if (!rowCount) return null;
  const est = rows[0];

  const lineItems = await client.query(
    `SELECT description, quantity, unit_price_cents, total_cents
     FROM estimate_line_items WHERE estimate_id = $1
       AND coalesce(visible_to_customer, true) = true
     ORDER BY sort_order ASC, created_at ASC`,
    [id],
  );

  // Multi-option estimates store priced choices in estimate_options (the parent
  // total is intentionally 0). Render each option as its own priced section so
  // the customer sees the real pricing instead of a flat $0 document.
  let options: EstimateOptionGroup[] | undefined;
  if (est.presentation_mode === "multi_option") {
    const optRows = await client.query(
      `SELECT id, label, description, total_cents, is_recommended
       FROM estimate_options WHERE estimate_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [id],
    );
    options = await Promise.all(
      optRows.rows.map(async (o) => {
        const optItems = await client.query(
          `SELECT description, quantity, unit_price_cents, total_cents
           FROM estimate_line_items
           WHERE estimate_id = $1 AND option_id = $2
             AND coalesce(visible_to_customer, true) = true
           ORDER BY sort_order ASC, created_at ASC`,
          [id, o.id],
        );
        return {
          label: String(o.label ?? "Option"),
          description: (o.description as string | null) ?? null,
          isRecommended: Boolean(o.is_recommended),
          totalCents: Number(o.total_cents ?? 0),
          lineItems: mapLineItems(optItems.rows),
        };
      }),
    );
  }

  const ref = id.slice(0, 8).toUpperCase();
  const branding = brandingFromAccount(
    String(est.account_name ?? ""),
    est.account_settings,
    accountId
  );
  const bytes = await buildEstimatePdf({
    estimateRef: ref,
    status: String(est.status),
    clientName: est.client_name as string | null,
    clientEmail: est.client_email as string | null,
    jobTitle: est.job_title as string | null,
    propertyAddress: est.property_address as string | null,
    issueDate: (est.sent_at ?? est.created_at) as string | null,
    expiresDate: est.expires_at as string | null,
    subtotalCents: Number(est.subtotal_cents ?? 0),
    taxCents: Number(est.tax_cents ?? 0),
    totalCents: Number(est.total_cents ?? 0),
    depositCents: Number(est.deposit_cents ?? 0),
    notes: est.notes as string | null,
    lineItems: mapLineItems(lineItems.rows),
    options,
    branding,
  });

  const filename = buildClientDocumentFilename({
    date: (est.sent_at ?? est.created_at) as string,
    clientName: est.client_name as string | null,
    jobType: (est.job_title as string | null) ?? "Estimate",
    documentType: "estimate",
    status: (String(est.status) === "approved" ? "final" : String(est.status)) as never,
  });

  return {
    filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
    bytes,
    clientId: String(est.client_id),
    clientEmail: est.client_email as string | null,
    ref,
  };
}
