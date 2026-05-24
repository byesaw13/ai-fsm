import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { queryOne, getPool } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !sig) {
    logger.error("Stripe webhook: missing secret or signature");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    logger.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    const invoiceId = pi.metadata?.invoice_id;
    if (!invoiceId) {
      return NextResponse.json({ received: true });
    }

    const invoice = await queryOne<{ id: string; account_id: string } & Record<string, unknown>>(
      `SELECT id, account_id FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    if (!invoice) {
      logger.error("Stripe webhook: invoice not found", { invoiceId });
      return NextResponse.json({ received: true });
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO payments (account_id, invoice_id, amount_cents, method, received_at, notes, stripe_payment_intent_id)
         VALUES ($1, $2, $3, $4, now(), $5, $6)
         ON CONFLICT (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          invoice.account_id,
          invoice.id,
          pi.amount_received,
          pi.payment_method_types?.[0] ?? "card",
          `Stripe payment intent ${pi.id}`,
          pi.id,
        ]
      );
      await client.query("COMMIT");
      if (inserted.rowCount === 0) {
        logger.info("Stripe webhook: duplicate event ignored", { paymentIntentId: pi.id });
      } else {
        logger.info("Stripe payment recorded", { invoiceId, amount: pi.amount_received });
      }
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("Stripe webhook: failed to record payment", err);
      return NextResponse.json({ error: "Payment recording failed" }, { status: 500 });
    } finally {
      client.release();
    }
  }

  return NextResponse.json({ received: true });
}
