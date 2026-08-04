import type { PoolClient } from "pg";
import { logger } from "@/lib/logger";
import {
  ATTENTION_EMAIL_TYPES,
  type AttentionEmailType,
  type AttentionEventType,
} from "./types";

function isEmailType(t: string): t is AttentionEmailType {
  return (ATTENTION_EMAIL_TYPES as readonly string[]).includes(t);
}

/** 15-minute bucket for idempotency (UTC). */
export function emailIdempotencyBucket(now = new Date()): string {
  const ms = 15 * 60 * 1000;
  return String(Math.floor(now.getTime() / ms));
}

/**
 * Enqueue owner-facing attention email via notification_queue (worker sends).
 * HIGH priority bypasses client cooldown caps. Never throws.
 */
export async function enqueueAttentionOwnerEmail(
  client: PoolClient,
  opts: {
    accountId: string;
    type: AttentionEventType | string;
    entityType: string;
    entityId: string;
    title: string;
    summary?: string | null;
    href: string;
  },
): Promise<"enqueued" | "skipped" | "duplicate" | "error"> {
  if (!isEmailType(opts.type)) return "skipped";

  try {
    const owner = await client.query<{ email: string; full_name: string | null }>(
      `SELECT u.email, u.full_name
       FROM users u
       WHERE u.account_id = $1 AND u.role IN ('owner', 'admin') AND u.email IS NOT NULL
       ORDER BY CASE WHEN u.role = 'owner' THEN 0 ELSE 1 END, u.created_at ASC
       LIMIT 1`,
      [opts.accountId],
    );
    const to = owner.rows[0]?.email?.trim();
    if (!to) {
      logger.info("attention email skipped — no owner/admin email", {
        accountId: opts.accountId,
        type: opts.type,
      });
      return "skipped";
    }

    const bucket = emailIdempotencyBucket();
    const idempotencyKey = `attention-email:${opts.type}:${opts.entityId}:${bucket}`;

    const existing = await client.query<{ status: string }>(
      `SELECT status FROM notification_queue WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey],
    );
    if (existing.rows.length > 0 && existing.rows[0].status !== "failed") {
      return "duplicate";
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.mydovetails.com").replace(
      /\/$/,
      "",
    );
    const link = `${appUrl}${opts.href.startsWith("/") ? opts.href : `/${opts.href}`}`;
    const subject = `[Dovetails] ${opts.title}`;
    const summaryLine = opts.summary
      ? `<p style="color:#57534e;margin:8px 0">${escapeHtml(opts.summary)}</p>`
      : "";
    const htmlBody = `
      <div style="font-family:system-ui,sans-serif;max-width:520px">
        <h2 style="margin:0 0 8px;color:#166534">${escapeHtml(opts.title)}</h2>
        ${summaryLine}
        <p><a href="${link}" style="color:#166534;font-weight:600">Open in app →</a></p>
        <p style="font-size:12px;color:#78716c;margin-top:24px">You received this because something needs attention in Dovetails.</p>
      </div>
    `;

    // priority 30 = HIGH (bypass cooldown/daily cap for owner alerts)
    await client.query(
      `INSERT INTO notification_queue
         (account_id, client_id, automation_type, priority, to_address,
          subject, html_body, idempotency_key, entity_type, entity_id,
          next_attempt_at, metadata)
       VALUES ($1, NULL, $2, 30, $3, $4, $5, $6, $7, $8, now(), $9)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        opts.accountId,
        `attention.${opts.type}`,
        to,
        subject,
        htmlBody,
        idempotencyKey,
        opts.entityType,
        opts.entityId,
        JSON.stringify({ attentionType: opts.type, href: opts.href }),
      ],
    );
    return "enqueued";
  } catch (err) {
    logger.error("enqueueAttentionOwnerEmail failed (non-fatal)", err, {
      type: opts.type,
      entityId: opts.entityId,
    });
    return "error";
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
