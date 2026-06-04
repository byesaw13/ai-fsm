import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne, withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { randomUUID } from "crypto";
import { normalizePhone } from "@/lib/phone";
import { getClientContext } from "@/lib/sms/context";
import { classifySms, type SmsClassification } from "@/lib/sms/classify";
import { logCommunication } from "@/lib/communications-log";
import { createActionItem } from "@/lib/action-items";

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
 * Raise an Inbox action item as the owner. action_items has FORCE ROW LEVEL
 * SECURITY, so the insert must run with RLS session context set — withDbSession
 * sets app.current_account_id/user_id/role for the transaction.
 */
async function raiseActionItem(
  session: { userId: string; accountId: string; role: "owner" },
  entityType: "booking_request" | "estimate" | "job" | "invoice",
  entityId: string,
  actionType: string,
  title: string
): Promise<void> {
  await withDbSession(session, (client) =>
    createActionItem(client, { accountId: session.accountId, entityType, entityId, actionType, title })
  );
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

  const ownerSession = { userId, accountId, role: "owner" as const };

  // Claim idempotency BEFORE any side effects: insert the inbound row now (no
  // job linkage yet). If a concurrent delivery of the same external_id already
  // claimed it, bail before creating jobs/action items. The job_id is back-
  // filled after routing.
  const commsId = await logCommunication({
    accountId,
    channel: "sms",
    direction: "inbound",
    outcome: "replied",
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
      await raiseActionItem(
        ownerSession, "estimate", target, "confirm_approval",
        "Customer texted approval — confirm estimate"
      );
      actionLine = "✅ Approval — confirm the estimate in your Inbox";
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

  // Review queue: low-confidence (or unmatched approval) → Inbox action item.
  // Action items need an entity; use the active/created job as the container.
  if (needsReview) {
    if (!jobId) jobId = await createDraftJob(accountId, clientId, userId, ai, message);
    await raiseActionItem(
      ownerSession, "job", jobId, "review_intake",
      ai.message_type === "approval"
        ? "Review SMS approval — couldn't match estimate"
        : "Review SMS — low confidence"
    );
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
