import { query, queryOne } from "@/lib/db";
import { logCommunication } from "@/lib/communications-log";
import { normalizePhone } from "@/lib/phone";

export type OutboundSmsOutcome = "sent" | "delivered" | "failed";

/**
 * Resolve a client by phone for the account (E.164-normalized match).
 */
export async function findClientByPhone(
  accountId: string,
  rawPhone: string
): Promise<{ id: string; name: string; phone: string | null } | null> {
  const phone = normalizePhone(rawPhone) ?? rawPhone.replace(/\D/g, "");
  if (!phone || phone.length < 7) return null;

  // Prefer exact E.164 match; also try last-10 US national match for loose storage.
  const digits = phone.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;

  const row = await queryOne<{ id: string; name: string; phone: string | null }>(
    `SELECT id, name, phone FROM clients
     WHERE account_id = $1
       AND (
         phone = $2
         OR phone = $3
         OR right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $4
       )
     ORDER BY
       CASE WHEN phone = $2 THEN 0 WHEN phone = $3 THEN 1 ELSE 2 END,
       created_at DESC
     LIMIT 1`,
    [accountId, phone, `+${digits}`, last10]
  );
  return row;
}

/**
 * Pick the best open job to attach an outbound SMS to (active statuses first).
 */
export async function findActiveJobForClient(
  accountId: string,
  clientId: string
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM jobs
     WHERE account_id = $1 AND client_id = $2
       AND status IN ('draft', 'quoted', 'scheduled', 'in_progress')
     ORDER BY
       CASE status
         WHEN 'in_progress' THEN 1
         WHEN 'scheduled' THEN 2
         WHEN 'quoted' THEN 3
         WHEN 'draft' THEN 4
         ELSE 5
       END,
       updated_at DESC
     LIMIT 1`,
    [accountId, clientId]
  );
  return row?.id ?? null;
}

/**
 * Log an outbound SMS. Idempotent when externalId is set.
 * Returns the communications_log id, or null if duplicate.
 */
export async function logOutboundSms(opts: {
  accountId: string;
  clientId: string | null;
  jobId?: string | null;
  bodyPreview: string | null;
  outcome: OutboundSmsOutcome;
  externalId?: string | null;
  initiatedBy?: string | null;
}): Promise<string | null> {
  return logCommunication({
    accountId: opts.accountId,
    channel: "sms",
    direction: "outbound",
    outcome: opts.outcome,
    clientId: opts.clientId,
    jobId: opts.jobId ?? null,
    bodyPreview: opts.bodyPreview?.slice(0, 1000) ?? null,
    externalId: opts.externalId ?? null,
    initiatedBy: opts.initiatedBy ?? null,
  });
}

/**
 * If we already logged a "sent" row with this external_id, update outcome
 * (e.g. delivered/failed from gateway webhooks).
 */
export async function updateOutboundSmsOutcome(
  accountId: string,
  externalId: string,
  outcome: OutboundSmsOutcome
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE communications_log
     SET outcome = $3
     WHERE account_id = $1
       AND external_id = $2
       AND channel = 'sms'
       AND direction = 'outbound'
     RETURNING id`,
    [accountId, externalId, outcome]
  );
  return rows.length > 0;
}
