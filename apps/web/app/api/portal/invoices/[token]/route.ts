import { NextRequest, NextResponse } from "next/server";
import { queryOne, query, getPool } from "@/lib/db";
import { loadSquareSettings, createSquarePaymentLink } from "@/lib/integrations/square-payments";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface InvoiceRow extends Record<string, unknown> {
  id: string;
  account_id: string;
  client_id: string;
  job_id: string | null;
  created_by: string;
  status: string;
  invoice_number: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  deposit_cents: number | null;
  notes: string | null;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  square_payment_link_url: string | null;
  client_name: string;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  account_name: string;
  account_settings: Record<string, unknown>;
}

interface LineItemRow extends Record<string, unknown> {
  id: string;
  description: string;
  quantity: string;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invoice = await queryOne<InvoiceRow>(
    `SELECT
       i.id, i.status, i.invoice_number, i.subtotal_cents, i.tax_cents,
       i.total_cents, i.paid_cents, i.deposit_cents, i.notes, i.due_date,
       i.sent_at, i.paid_at, i.square_payment_link_url,
       c.name AS client_name,
       p.address AS property_address, p.city AS property_city,
       p.state AS property_state, p.zip AS property_zip,
       a.name AS account_name, a.settings AS account_settings
     FROM invoices i
     JOIN clients c ON c.id = i.client_id
     JOIN accounts a ON a.id = i.account_id
     LEFT JOIN properties p ON p.id = i.property_id
     WHERE i.share_token = $1`,
    [token]
  );

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lineItems = await query<LineItemRow>(
    `SELECT id, description, quantity, unit_price_cents, total_cents, sort_order
     FROM invoice_line_items
     WHERE invoice_id = $1 AND visible_to_customer = true
     ORDER BY sort_order`,
    [invoice.id]
  );

  return NextResponse.json({ invoice, lineItems });
}

// POST — return a Square-hosted checkout link for the outstanding balance so the
// client can pay by card. Reuses an existing link if one is already on the
// invoice; otherwise creates one and records a PENDING payment. The Square
// webhook marks the invoice paid when the customer completes checkout.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invoice = await queryOne<InvoiceRow>(
    `SELECT i.id, i.account_id, i.status, i.invoice_number, i.total_cents,
            i.paid_cents, i.job_id, i.client_id, i.created_by,
            i.square_payment_link_url
     FROM invoices i
     WHERE i.share_token = $1`,
    [token]
  );

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status === "paid" || invoice.status === "void") {
    return NextResponse.json({ error: "Invoice is not payable" }, { status: 422 });
  }

  const balance = invoice.total_cents - invoice.paid_cents;
  if (balance <= 0) {
    return NextResponse.json({ error: "Nothing left to pay" }, { status: 422 });
  }

  // Reuse an existing link (owner may have already created one).
  if (invoice.square_payment_link_url) {
    return NextResponse.json({ url: invoice.square_payment_link_url });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const settings = await loadSquareSettings(client, invoice.account_id as string);
    if (
      !settings ||
      !settings.enabled ||
      !settings.secrets.accessToken ||
      !settings.config.locationId
    ) {
      return NextResponse.json(
        { error: "Online payment is not available for this invoice." },
        { status: 422 }
      );
    }

    const link = await createSquarePaymentLink(settings, {
      name: `${invoice.invoice_number} — Balance`,
      amountCents: balance,
      idempotencyKey: `portal:${invoice.id}:${balance}`,
    });

    await client.query("BEGIN");
    await client.query(
      `UPDATE invoices
       SET square_order_id = $2, square_checkout_id = $3, square_payment_link_url = $4
       WHERE id = $1`,
      [invoice.id, link.orderId, link.paymentLinkId, link.url]
    );
    await client.query(
      `INSERT INTO payments
         (account_id, invoice_id, job_id, customer_id, amount_cents, method,
          payment_type, status, external_provider, external_checkout_url, created_by)
       VALUES ($1, $2, $3, $4, $5, 'square', 'progress', 'pending', 'square', $6, $7)`,
      [
        invoice.account_id,
        invoice.id,
        invoice.job_id,
        invoice.client_id,
        balance,
        link.url,
        invoice.created_by,
      ]
    );
    await client.query("COMMIT");

    return NextResponse.json({ url: link.url });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("Portal Square link creation failed", err);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
