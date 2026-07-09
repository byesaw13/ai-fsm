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
  buildInvoicePdf,
  buildEstimatePdf,
  toDocumentBranding,
  type PdfLineItem,
  type EstimateOptionGroup,
} from "./document-pdf";
import { resolveCompanyBranding, type CompanyProfileSettings } from "@/lib/company/branding";
import {
  DOCUMENT_LOCATION_SELECT,
  documentJoins,
  resolveServiceLocation,
} from "@/lib/documents/service-location";
import { parseLineQuantity } from "@/lib/invoices/quantity";

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
    quantity: parseLineQuantity(r.quantity),
    unitPriceCents: Number(r.unit_price_cents ?? 0),
    totalCents: Number(r.total_cents ?? 0),
  }));
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
            i.total_cents, i.paid_cents, i.paid_at, i.due_date, i.notes, i.sent_at, i.created_at,
            c.id AS client_id,
            j.title AS job_title,
            a.name AS account_name, a.settings AS account_settings,
            ${DOCUMENT_LOCATION_SELECT}
     FROM invoices i
     JOIN accounts a ON a.id = i.account_id
     ${documentJoins({ root: "i", includeEstimateProperty: true })}
     WHERE i.id = $1 AND i.account_id = $2`,
    [id, accountId],
  );
  if (!rowCount) return null;
  const inv = rows[0];
  const accountSettings = (inv.account_settings ?? {}) as CompanyProfileSettings;
  const branding = resolveCompanyBranding(
    String(inv.account_name ?? ""),
    accountSettings,
    accountId,
  );

  // Match the customer portal: never expose internal-only line items.
  const lineItems = await client.query(
    `SELECT description, quantity::float8 AS quantity, unit_price_cents, total_cents
     FROM invoice_line_items WHERE invoice_id = $1
       AND visible_to_customer = true
     ORDER BY sort_order ASC, created_at ASC`,
    [id],
  );

  const bytes = await buildInvoicePdf({
    invoiceNumber: String(inv.invoice_number),
    status: String(inv.status),
    clientName: inv.client_name as string | null,
    clientEmail: inv.client_email as string | null,
    jobTitle: inv.job_title as string | null,
    propertyAddress: resolveServiceLocation({
      property_address: inv.property_address as string | null,
      property_city: inv.property_city as string | null,
      property_state: inv.property_state as string | null,
      property_zip: inv.property_zip as string | null,
      client_address_line1: inv.client_address_line1 as string | null,
      client_city: inv.client_city as string | null,
      client_state: inv.client_state as string | null,
      client_zip: inv.client_zip as string | null,
    }),
    issueDate: (inv.sent_at ?? inv.created_at) as string | null,
    dueDate: inv.due_date as string | null,
    subtotalCents: Number(inv.subtotal_cents ?? 0),
    taxCents: Number(inv.tax_cents ?? 0),
    totalCents: Number(inv.total_cents ?? 0),
    paidCents: Number(inv.paid_cents ?? 0),
    paidAt: inv.paid_at as string | null,
    notes: inv.notes as string | null,
    paymentTerms: branding.invoiceTerms,
    branding: toDocumentBranding(branding),
    lineItems: mapLineItems(lineItems.rows),
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
            c.id AS client_id,
            j.title AS job_title,
            a.name AS account_name, a.settings AS account_settings,
            ${DOCUMENT_LOCATION_SELECT}
     FROM estimates e
     JOIN accounts a ON a.id = e.account_id
     ${documentJoins({ root: "e" })}
     WHERE e.id = $1 AND e.account_id = $2`,
    [id, accountId],
  );
  if (!rowCount) return null;
  const est = rows[0];
  const accountSettings = (est.account_settings ?? {}) as CompanyProfileSettings;
  const branding = resolveCompanyBranding(
    String(est.account_name ?? ""),
    accountSettings,
    accountId,
  );

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
  const bytes = await buildEstimatePdf({
    estimateRef: ref,
    status: String(est.status),
    clientName: est.client_name as string | null,
    clientEmail: est.client_email as string | null,
    jobTitle: est.job_title as string | null,
    propertyAddress: resolveServiceLocation({
      property_address: est.property_address as string | null,
      property_city: est.property_city as string | null,
      property_state: est.property_state as string | null,
      property_zip: est.property_zip as string | null,
      client_address_line1: est.client_address_line1 as string | null,
      client_city: est.client_city as string | null,
      client_state: est.client_state as string | null,
      client_zip: est.client_zip as string | null,
    }),
    issueDate: (est.sent_at ?? est.created_at) as string | null,
    expiresDate: est.expires_at as string | null,
    subtotalCents: Number(est.subtotal_cents ?? 0),
    taxCents: Number(est.tax_cents ?? 0),
    totalCents: Number(est.total_cents ?? 0),
    depositCents: Number(est.deposit_cents ?? 0),
    notes: est.notes as string | null,
    estimateTerms: branding.estimateTerms,
    branding: toDocumentBranding(branding),
    lineItems: mapLineItems(lineItems.rows),
    options,
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
