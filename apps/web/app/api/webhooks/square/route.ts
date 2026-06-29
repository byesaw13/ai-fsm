import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { decryptJson } from "@/lib/crypto";
import { verifySquareWebhook, type SquareSecrets } from "@/lib/integrations/square";

export const dynamic = "force-dynamic";

// === POST /api/webhooks/square ===
// Handles payment.created / payment.updated and refund.created / refund.updated.
// Square delivers events at-least-once, so processing is idempotent via the
// unique index on (external_provider, external_payment_id). The app DB role
// bypasses RLS, so no session context is set on this unauthenticated endpoint.

interface SquarePaymentObject {
  id?: string;
  status?: string; // APPROVED | COMPLETED | CANCELED | FAILED
  order_id?: string;
  location_id?: string;
  amount_money?: { amount?: number; currency?: string };
}

interface SquareRefundObject {
  id?: string;
  status?: string; // PENDING | COMPLETED | REJECTED | FAILED
  payment_id?: string;
  order_id?: string;
  location_id?: string;
  amount_money?: { amount?: number; currency?: string };
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Parse untrusted body just enough to locate the account (by location_id) so
  // we can fetch the right signing key, then verify before acting on anything.
  let event: {
    type?: string;
    data?: { object?: { payment?: SquarePaymentObject; refund?: SquareRefundObject } };
  };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payment = event.data?.object?.payment;
  const refund = event.data?.object?.refund;
  // location_id appears on whichever object the event carries.
  const locationId = payment?.location_id ?? refund?.location_id;
  if (!locationId) {
    // Not an event we handle — ack so Square stops retrying.
    return NextResponse.json({ received: true });
  }

  const pool = getPool();

  // Resolve the account + signing key from the location id (raw, RLS-bypassed).
  const settingsRow = await pool.query<{
    account_id: string;
    enabled: boolean;
    secrets: Buffer | null;
    webhook_url: string | null;
  }>(
    `SELECT account_id, enabled, secrets, config->>'webhookUrl' AS webhook_url
     FROM integration_settings
     WHERE provider = 'square' AND config->>'locationId' = $1`,
    [locationId]
  );
  if (settingsRow.rowCount === 0) {
    logger.error("Square webhook: no account for location", { locationId });
    return NextResponse.json({ received: true });
  }
  const { account_id, secrets, webhook_url } = settingsRow.rows[0];
  const decrypted: SquareSecrets = secrets
    ? decryptJson<SquareSecrets>(secrets)
    : { accessToken: null, webhookSignatureKey: null };

  if (!decrypted.webhookSignatureKey) {
    logger.error("Square webhook: no signature key configured", { account_id });
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  // Verify against the registered notification URL. Prefer the value saved in
  // the Square settings panel; fall back to an env override, then request.url.
  const notificationUrl =
    webhook_url || process.env.SQUARE_WEBHOOK_URL || request.url;
  const valid = await verifySquareWebhook({
    body,
    signature,
    signatureKey: decrypted.webhookSignatureKey,
    notificationUrl,
  });
  if (!valid) {
    logger.error("Square webhook: signature verification failed", { account_id });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const isPaymentEvent =
    event.type === "payment.created" || event.type === "payment.updated";
  const isRefundEvent =
    event.type === "refund.created" || event.type === "refund.updated";

  try {
    if (isPaymentEvent && payment?.status === "COMPLETED" && payment.id) {
      await handleCompletedPayment(pool, account_id, payment);
    } else if (isRefundEvent && refund?.status === "COMPLETED" && refund.id) {
      await handleCompletedRefund(pool, account_id, refund);
    }
  } catch (err) {
    logger.error("Square webhook: failed to process event", err);
    return NextResponse.json({ error: "Event processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Mark the invoice's pending Square payment paid (or insert a paid row), then
// emit payment.recorded and, if the invoice cleared, invoice.paid.
async function handleCompletedPayment(
  pool: { connect: () => Promise<PoolClient> },
  accountId: string,
  payment: SquarePaymentObject
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Idempotency: bail if we've already recorded this Square payment.
    const dup = await client.query(
      `SELECT 1 FROM payments
       WHERE external_provider = 'square' AND external_payment_id = $1`,
      [payment.id]
    );
    if (dup.rowCount && dup.rowCount > 0) {
      await client.query("COMMIT");
      logger.info("Square webhook: duplicate payment ignored", { paymentId: payment.id });
      return;
    }

    // Match the invoice by the saved Square order id.
    const invoiceRes = await client.query<{ id: string }>(
      `SELECT id FROM invoices
       WHERE account_id = $1 AND square_order_id = $2`,
      [accountId, payment.order_id ?? ""]
    );
    const invoiceId = invoiceRes.rows[0]?.id;
    if (!invoiceId) {
      await client.query("COMMIT");
      logger.error("Square webhook: no invoice for order", { orderId: payment.order_id });
      return;
    }

    // Prefer completing the existing PENDING link row; otherwise insert one.
    const pending = await client.query<{ id: string }>(
      `SELECT id FROM payments
       WHERE invoice_id = $1 AND external_provider = 'square'
         AND status = 'pending' AND external_payment_id IS NULL
       ORDER BY created_at ASC
       LIMIT 1`,
      [invoiceId]
    );

    let paymentRowId: string;
    let amountCents: number;
    if (pending.rowCount && pending.rowCount > 0) {
      const upd = await client.query<{ id: string; amount_cents: number }>(
        `UPDATE payments
         SET status = 'paid', external_payment_id = $2,
             paid_at = now(), received_at = now()
         WHERE id = $1
         RETURNING id, amount_cents`,
        [pending.rows[0].id, payment.id]
      );
      paymentRowId = upd.rows[0].id;
      amountCents = upd.rows[0].amount_cents;
    } else {
      amountCents = payment.amount_money?.amount ?? 0;
      const inv = await client.query<{ account_id: string; client_id: string; job_id: string | null; created_by: string }>(
        `SELECT account_id, client_id, job_id, created_by FROM invoices WHERE id = $1`,
        [invoiceId]
      );
      // payments.created_by is NOT NULL; system-recorded Square payments are
      // attributed to whoever created the invoice.
      const ins = await client.query<{ id: string }>(
        `INSERT INTO payments
           (account_id, invoice_id, job_id, customer_id, amount_cents, method,
            payment_type, status, external_provider, external_payment_id, paid_at, created_by)
         VALUES ($1, $2, $3, $4, $5, 'square', 'progress', 'paid', 'square', $6, now(), $7)
         ON CONFLICT (external_provider, external_payment_id)
           WHERE external_provider IS NOT NULL AND external_payment_id IS NOT NULL
           DO NOTHING
         RETURNING id`,
        [
          inv.rows[0].account_id,
          invoiceId,
          inv.rows[0].job_id,
          inv.rows[0].client_id,
          amountCents,
          payment.id,
          inv.rows[0].created_by,
        ]
      );
      if (ins.rowCount === 0) {
        await client.query("COMMIT");
        return;
      }
      paymentRowId = ins.rows[0].id;
    }

    // Daily Operations Log: payment recorded, and invoice.paid if cleared.
    await client.query(
      `INSERT INTO workflow_events (account_id, event_type, entity_type, entity_id, payload)
       VALUES ($1, 'payment.recorded', 'payment', $2, $3)`,
      [
        accountId,
        paymentRowId,
        JSON.stringify({ invoiceId, amountCents, method: "square", source: "square_webhook" }),
      ]
    );
    const inv = await client.query<{ status: string }>(
      `SELECT status FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    if (inv.rows[0]?.status === "paid") {
      await client.query(
        `INSERT INTO workflow_events (account_id, event_type, entity_type, entity_id, payload)
         VALUES ($1, 'invoice.paid', 'invoice', $2, $3)`,
        [accountId, invoiceId, JSON.stringify({ amountCents, method: "square" })]
      );
    }

    await client.query("COMMIT");
    logger.info("Square payment recorded", { invoiceId, amountCents });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Record a Square-initiated refund as a ledger-only payment row (status
// 'refunded', payment_type 'refund'). The sync trigger ignores non-'paid' rows,
// so paid_cents is unchanged — matching manual refund semantics. Linked to the
// invoice via the original payment (refund.payment_id) or the order id.
async function handleCompletedRefund(
  pool: { connect: () => Promise<PoolClient> },
  accountId: string,
  refund: SquareRefundObject
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Idempotency: refund.id is distinct from the payment id; the unique index
    // on (external_provider, external_payment_id) also guards the INSERT.
    const dup = await client.query(
      `SELECT 1 FROM payments
       WHERE external_provider = 'square' AND external_payment_id = $1`,
      [refund.id]
    );
    if (dup.rowCount && dup.rowCount > 0) {
      await client.query("COMMIT");
      logger.info("Square webhook: duplicate refund ignored", { refundId: refund.id });
      return;
    }

    // Resolve the invoice + attribution. Prefer the original payment row
    // (refund.payment_id); fall back to matching the invoice by order id.
    const orig = await client.query<{
      invoice_id: string;
      account_id: string;
      client_id: string | null;
      job_id: string | null;
      created_by: string;
    }>(
      `SELECT p.invoice_id, p.account_id, p.customer_id AS client_id, p.job_id,
              i.created_by
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       WHERE p.external_provider = 'square' AND p.external_payment_id = $1`,
      [refund.payment_id ?? ""]
    );

    let target = orig.rows[0];
    if (!target) {
      const inv = await client.query<{
        invoice_id: string;
        account_id: string;
        client_id: string;
        job_id: string | null;
        created_by: string;
      }>(
        `SELECT id AS invoice_id, account_id, client_id, job_id, created_by
         FROM invoices
         WHERE account_id = $1 AND square_order_id = $2`,
        [accountId, refund.order_id ?? ""]
      );
      target = inv.rows[0];
    }

    if (!target) {
      await client.query("COMMIT");
      logger.error("Square webhook: no invoice for refund", {
        refundId: refund.id,
        paymentId: refund.payment_id,
      });
      return;
    }

    const amountCents = refund.amount_money?.amount ?? 0;
    const ins = await client.query<{ id: string }>(
      `INSERT INTO payments
         (account_id, invoice_id, job_id, customer_id, amount_cents, method,
          payment_type, status, external_provider, external_payment_id, created_by)
       VALUES ($1, $2, $3, $4, $5, 'square', 'refund', 'refunded', 'square', $6, $7)
       ON CONFLICT (external_provider, external_payment_id)
         WHERE external_provider IS NOT NULL AND external_payment_id IS NOT NULL
         DO NOTHING
       RETURNING id`,
      [
        target.account_id,
        target.invoice_id,
        target.job_id,
        target.client_id,
        amountCents,
        refund.id,
        target.created_by,
      ]
    );
    if (ins.rowCount === 0) {
      await client.query("COMMIT");
      return;
    }

    await client.query(
      `INSERT INTO workflow_events (account_id, event_type, entity_type, entity_id, payload)
       VALUES ($1, 'payment.recorded', 'payment', $2, $3)`,
      [
        target.account_id,
        ins.rows[0].id,
        JSON.stringify({
          invoiceId: target.invoice_id,
          amountCents,
          method: "square",
          paymentType: "refund",
          source: "square_webhook",
        }),
      ]
    );

    await client.query("COMMIT");
    logger.info("Square refund recorded", { invoiceId: target.invoice_id, amountCents });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
