import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryOne, query, getPool } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

interface InvoiceRow extends Record<string, unknown> {
  id: string;
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
  stripe_payment_intent_id: string | null;
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
       i.sent_at, i.paid_at, i.stripe_payment_intent_id,
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

const payBody = z.object({
  amount_cents: z.number().int().positive(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invoice = await queryOne<InvoiceRow>(
    `SELECT i.id, i.status, i.total_cents, i.paid_cents, i.stripe_payment_intent_id,
            a.name AS account_name
     FROM invoices i
     JOIN accounts a ON a.id = i.account_id
     WHERE i.share_token = $1`,
    [token]
  );

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status === "paid" || invoice.status === "void") {
    return NextResponse.json({ error: "Invoice is not payable" }, { status: 422 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const balance = invoice.total_cents - invoice.paid_cents;
  if (parsed.data.amount_cents > balance) {
    return NextResponse.json({ error: "Amount exceeds balance due" }, { status: 422 });
  }

  const stripe = getStripe();

  // Reuse existing PaymentIntent if not yet succeeded
  if (invoice.stripe_payment_intent_id) {
    const existing = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id);
    if (existing.status !== "succeeded" && existing.status !== "canceled") {
      const updated = await stripe.paymentIntents.update(invoice.stripe_payment_intent_id, {
        amount: parsed.data.amount_cents,
      });
      return NextResponse.json({ clientSecret: updated.client_secret });
    }
  }

  const pi = await stripe.paymentIntents.create({
    amount: parsed.data.amount_cents,
    currency: "usd",
    metadata: {
      invoice_id: invoice.id,
      invoice_share_token: token,
    },
    description: `Payment for Invoice — ${invoice.account_name}`,
    automatic_payment_methods: { enabled: true },
  });

  const pool = getPool();
  await pool.query(
    `UPDATE invoices SET stripe_payment_intent_id = $1 WHERE id = $2`,
    [pi.id, invoice.id]
  );

  return NextResponse.json({ clientSecret: pi.client_secret });
}
