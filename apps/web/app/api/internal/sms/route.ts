import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";
import { randomUUID } from "crypto";
import { normalizePhone } from "@/lib/phone";
import { getClientContext } from "@/lib/sms/context";
import { classifySms, type SmsClassification } from "@/lib/sms/classify";
import { logCommunication } from "@/lib/communications-log";
import { detectSmsKeyword, replyForSmsKeyword, type SmsKeyword } from "@/lib/sms/keywords";
import { SMS_CONSENT_TEXT } from "@/lib/sms/consent";
import { isSmsGatewayConfigured, sendSmsViaGateway } from "@/lib/sms/gateway";
import { logOutboundSms } from "@/lib/sms/outbound";

export const dynamic = "force-dynamic";

const SMS_KEY = process.env.SMS_INTERNAL_KEY;

const bodySchema = z.object({
  phone: z.string().min(7).max(20),
  message: z.string().min(1).max(2000),
  external_id: z.string().max(255).optional(),
});

const ACTIVE_JOB_STATUSES = ["draft", "quoted", "scheduled", "in_progress"];

// ── owner account discovery (cached) ───────────────────────────────────────
let _accountId: string | null = null;
let _userId: string | null = null;
async function getOwnerContext(): Promise<{ accountId: string; userId: string }> {
  if (_accountId && _userId) return { accountId: _accountId, userId: _userId };
  const row = await queryOne<{ account_id: string; user_id: string }>(
    `SELECT a.id AS account_id, u.id AS user_id
     FROM accounts a JOIN users u ON u.account_id = a.id
     WHERE u.role = 'owner' ORDER BY u.created_at LIMIT 1`
  );
  if (!row) throw new Error("No owner account found in database");
  _accountId = row.account_id;
  _userId = row.user_id;
  return { accountId: _accountId, userId: _userId };
}

/**
 * Carrier-required STOP / HELP / START — handled before AI classification.
 * Updates consent, logs inbound, auto-replies via gateway when configured.
 */
async function handleSmsKeyword(opts: {
  accountId: string;
  phone: string;
  message: string;
  keyword: SmsKeyword;
  externalId?: string;
  existing: { id: string; name: string } | null;
  traceId: string;
}): Promise<NextResponse> {
  const { accountId, phone, message, keyword, externalId, existing, traceId } = opts;
  const reply = replyForSmsKeyword(keyword);

  let clientId: string | null = existing?.id ?? null;
  let clientName = existing?.name ?? phone;

  // STOP/START need a client row to persist consent; create a minimal lead if new.
  if (!clientId && (keyword === "stop" || keyword === "start")) {
    const [created] = await query<{ id: string }>(
      `INSERT INTO clients (account_id, name, phone, notes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        accountId,
        `SMS Lead (${phone})`,
        phone,
        `Created from SMS keyword (${keyword}).\nFirst message: "${message}"`,
      ]
    );
    clientId = created.id;
    clientName = `SMS Lead (${phone})`;
  }

  if (clientId && keyword === "stop") {
    await query(
      `UPDATE clients
       SET sms_consent = false,
           sms_consent_at = NOW(),
           sms_consent_source = 'sms_stop',
           preferred_contact = CASE WHEN preferred_contact = 'sms' THEN 'email' ELSE preferred_contact END
       WHERE id = $1 AND account_id = $2`,
      [clientId, accountId]
    );
  } else if (clientId && keyword === "start") {
    await query(
      `UPDATE clients
       SET sms_consent = true,
           sms_consent_at = NOW(),
           sms_consent_source = 'sms_start',
           sms_consent_text = $3,
           preferred_contact = 'sms'
       WHERE id = $1 AND account_id = $2`,
      [clientId, accountId, SMS_CONSENT_TEXT]
    );
  }

  await logCommunication({
    accountId,
    channel: "sms",
    direction: "inbound",
    outcome: "received",
    clientId,
    jobId: null,
    bodyPreview: message.slice(0, 1000),
    externalId: externalId ?? null,
  });

  let autoReplied = false;
  if (isSmsGatewayConfigured()) {
    const sendResult = await sendSmsViaGateway({ phone, message: reply });
    autoReplied = sendResult.ok;
    if (sendResult.ok) {
      await logOutboundSms({
        accountId,
        clientId,
        bodyPreview: reply.slice(0, 1000),
        outcome: "sent",
        externalId: sendResult.messageId,
      });
    } else {
      logger.warn("SMS keyword auto-reply failed", {
        traceId,
        keyword,
        error: sendResult.error,
      });
    }
  }

  logger.info("SMS keyword handled", {
    traceId,
    keyword,
    phone,
    clientId,
    autoReplied,
  });

  const emoji = keyword === "stop" ? "🛑" : keyword === "help" ? "ℹ️" : "✅";
  const label =
    keyword === "stop"
      ? "SMS opt-out (STOP)"
      : keyword === "help"
        ? "SMS help request"
        : "SMS re-subscribe (START)";

  return NextResponse.json({
    keyword,
    client_id: clientId,
    job_id: null,
    message_type: "keyword",
    confidence: "high",
    is_new_client: !existing && Boolean(clientId),
    client_name: clientName,
    estimate_to_confirm: null,
    needs_review: false,
    auto_replied: autoReplied,
    // n8n: if auto_replied, do not send reply again
    notification: {
      title: `${emoji} ${label}: ${clientName}`,
      body: [
        `📞 ${phone}`,
        `Keyword: ${keyword.toUpperCase()}`,
        autoReplied ? "✅ Auto-reply sent" : "⚠️ Auto-reply queued for n8n (gateway not configured or send failed)",
        "",
        `💬 Reply: "${reply}"`,
      ].join("\n"),
    },
    reply,
  });
}

async function createDraftJob(
  accountId: string,
  clientId: string,
  userId: string,
  ai: SmsClassification,
  message: string
): Promise<string> {
  const [job] = await query<{ id: string }>(
    `INSERT INTO jobs (account_id, client_id, title, description, status, job_type, created_by)
     VALUES ($1, $2, $3, $4, 'draft', $5, $6) RETURNING id`,
    [
      accountId,
      clientId,
      ai.job_title ?? "SMS Inquiry",
      [`Original SMS: "${message}"`, ai.description ? `\nDetails: ${ai.description}` : ""]
        .filter(Boolean)
        .join(""),
      ai.job_type,
      userId,
    ]
  );
  return job.id;
}

// ── notification rendering ──────────────────────────────────────────────────
const TYPE_LABEL: Record<SmsClassification["message_type"], [string, string]> = {
  new_inquiry: ["🆕", "New inquiry"],
  cancellation: ["❌", "Cancellation"],
  approval: ["✅", "Approval"],
  follow_up: ["🔁", "Follow-up"],
  scheduling: ["📅", "Scheduling"],
  question: ["❓", "Question"],
  other_business: ["💬", "Message"],
};

function buildNotification(
  ai: SmsClassification,
  opts: { phone: string; clientName: string; isNewClient: boolean; actionLine: string }
): { title: string; body: string } {
  const [emoji, label] = TYPE_LABEL[ai.message_type];
  const who = opts.isNewClient ? "New client" : "Existing client";
  const detail =
    ai.message_type === "new_inquiry"
      ? `🔧 ${ai.job_title ?? "Inquiry"} (${ai.job_type})`
      : `💬 ${ai.description}`;
  const title = `${emoji} ${label}: ${ai.job_title ?? opts.clientName ?? opts.phone}`;
  const body = [
    `${who}: ${opts.clientName}`,
    `📞 ${opts.phone}`,
    detail,
    ai.urgency === "asap" ? "🔴 URGENT" : `⏱ ${ai.urgency}`,
    opts.actionLine,
    "",
    `💬 Reply: "${ai.reply}"`,
  ].join("\n");
  return { title, body };
}

// ── POST /api/internal/sms ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const traceId = randomUUID();

  if (!SMS_KEY || req.headers.get("x-api-key") !== SMS_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }
  const { phone: rawPhone, message, external_id } = parsed.data;
  const phone = normalizePhone(rawPhone) ?? rawPhone;

  let accountId: string, userId: string;
  try {
    ({ accountId, userId } = await getOwnerContext());
  } catch (err) {
    logger.error("Failed to resolve owner context", err as Error, { traceId });
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Idempotency: already-seen message → no re-action, no Claude call.
  // The unique index on (account_id, external_id) is the hard backstop.
  if (external_id) {
    const seen = await queryOne<{ id: string }>(
      `SELECT id FROM communications_log WHERE account_id = $1 AND external_id = $2 LIMIT 1`,
      [accountId, external_id]
    );
    if (seen) {
      logger.info("SMS duplicate ignored", { traceId, external_id });
      return NextResponse.json({ duplicate: true });
    }
  }

  // Existing client (don't create until we know it's business)
  const existing = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM clients WHERE account_id = $1 AND phone = $2 LIMIT 1`,
    [accountId, phone]
  );

  // CTIA keywords — handle before Claude; never create draft jobs for STOP/HELP/START
  const keyword = detectSmsKeyword(message);
  if (keyword) {
    return handleSmsKeyword({
      accountId,
      phone,
      message,
      keyword,
      externalId: external_id,
      existing,
      traceId,
    });
  }

  const context = existing
    ? await getClientContext(accountId, existing.id)
    : { openEstimates: [], recentJobs: [], recentMessages: [] };
  const ai = await classifySms({ message, phone, context });

  if (!ai.is_business) {
    logger.info("SMS not business — skipping", { traceId, phone, type: ai.message_type });
    return NextResponse.json({ skipped: true, reason: "not_business" });
  }

  // Resolve the client (create now if new)
  let clientId: string;
  let clientName: string;
  let isNewClient: boolean;
  if (existing) {
    clientId = existing.id;
    clientName = existing.name;
    isNewClient = false;
  } else {
    const [created] = await query<{ id: string }>(
      `INSERT INTO clients (account_id, name, phone, notes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        accountId,
        ai.customer_name ?? `SMS Lead (${phone})`,
        phone,
        `Created automatically from SMS.\n\nFirst message: "${message}"`,
      ]
    );
    clientId = created.id;
    clientName = ai.customer_name ?? `SMS Lead (${phone})`;
    isNewClient = true;
  }

  // Claim idempotency BEFORE any side effects: insert the inbound row now (no
  // job linkage yet). If a concurrent delivery of the same external_id already
  // claimed it, bail before creating jobs/action items. The job_id is back-
  // filled after routing.
  const commsId = await logCommunication({
    accountId,
    channel: "sms",
    direction: "inbound",
    // "received" = we ingested the inbound SMS (not that we texted back)
    outcome: "received",
    clientId,
    jobId: null,
    bodyPreview: message.slice(0, 1000),
    externalId: external_id ?? null,
  });
  if (external_id && commsId === null) {
    logger.info("SMS duplicate ignored (claim)", { traceId, external_id });
    return NextResponse.json({ duplicate: true });
  }

  const lowConfidence = ai.confidence === "low";
  const activeJobId =
    context.recentJobs.find((j) => ACTIVE_JOB_STATUSES.includes(j.status))?.id ?? null;

  // ── intent routing (confirm-first; never auto-mutates estimates) ────────
  let jobId: string | null = null;
  let estimateToConfirm: string | null = null;
  let needsReview = lowConfidence;
  let actionLine = "✅ Logged to client record";

  if (ai.message_type === "approval") {
    const sentEstimates = context.openEstimates.filter((e) => e.status === "sent");
    const target =
      sentEstimates.find((e) => e.id === ai.target_estimate_id)?.id ??
      (sentEstimates.length === 1 ? sentEstimates[0].id : null);
    if (target) {
      estimateToConfirm = target;
      actionLine = "✅ Approval — confirm the estimate";
    } else {
      needsReview = true;
      actionLine = "⚠️ Approval received — no single open estimate to match";
    }
  } else if (ai.message_type === "new_inquiry") {
    jobId = await createDraftJob(accountId, clientId, userId, ai, message);
    actionLine = "✅ Draft job created";
  } else if (ai.message_type === "cancellation") {
    jobId = activeJobId;
    actionLine = "❌ Cancellation flagged — review the job";
  } else {
    // follow_up / scheduling / question / other_business
    jobId = activeJobId;
  }

  // Review queue: low-confidence (or unmatched approval) messages still get
  // attached to a job so the thread is captured, then flagged in the reply line.
  if (needsReview) {
    if (!jobId) jobId = await createDraftJob(accountId, clientId, userId, ai, message);
    if (ai.message_type !== "approval") actionLine = "🔎 Needs review (low confidence)";
  }

  // Back-fill the job linkage onto the claimed inbound row.
  if (commsId && jobId) {
    await query(`UPDATE communications_log SET job_id = $1 WHERE id = $2`, [jobId, commsId]);
  }

  logger.info("SMS ingested", {
    traceId, clientId, jobId, type: ai.message_type, confidence: ai.confidence, estimateToConfirm,
  });

  const notification = buildNotification(ai, { phone, clientName, isNewClient, actionLine });

  return NextResponse.json({
    client_id: clientId,
    job_id: jobId,
    message_type: ai.message_type,
    confidence: ai.confidence,
    is_new_client: isNewClient,
    client_name: clientName,
    estimate_to_confirm: estimateToConfirm,
    needs_review: needsReview,
    notification,
    reply: ai.reply,
  });
}
