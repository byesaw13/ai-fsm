import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";
import { randomUUID } from "crypto";
import { getClientContext } from "@/lib/sms/context";
import { classifySms, type SmsClassification } from "@/lib/sms/classify";
import { withEstimateContext } from "@/lib/estimates/db";
import { approveEstimateInTx } from "@/lib/estimates/approve";
import { logCommunication } from "@/lib/communications-log";

export const dynamic = "force-dynamic";

const SMS_KEY = process.env.SMS_INTERNAL_KEY;

// Raw inbound SMS — classification now happens server-side.
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
  const { phone, message, external_id } = parsed.data;

  let accountId: string, userId: string;
  try {
    ({ accountId, userId } = await getOwnerContext());
  } catch (err) {
    logger.error("Failed to resolve owner context", err as Error, { traceId });
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Look up existing client first (don't create until we know it's business)
  const existing = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM clients WHERE account_id = $1 AND phone = $2 LIMIT 1`,
    [accountId, phone]
  );

  // Build context (empty for unknown numbers) and classify
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

  // ── intent actions ─────────────────────────────────────────────────────
  let jobId: string | null = null;
  let estimateApprovedId: string | null = null;
  let actionLine = "✅ Logged to client record";

  if (ai.message_type === "new_inquiry") {
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
    jobId = job.id;
    actionLine = "✅ Draft job created";
  } else if (ai.message_type === "approval") {
    // Target the identified estimate, else the most recent 'sent' one
    const targetId =
      ai.target_estimate_id ??
      context.openEstimates.find((e) => e.status === "sent")?.id ??
      null;
    if (targetId) {
      try {
        const result = await withEstimateContext(
          { userId, accountId, role: "owner" },
          (client) => approveEstimateInTx(client, { estimateId: targetId, accountId, userId, traceId })
        );
        if (result) {
          estimateApprovedId = targetId;
          jobId = result.jobId;
          actionLine = result.depositInvoiceId
            ? "✅ Estimate approved + deposit invoice created"
            : "✅ Estimate approved";
        } else {
          actionLine = "⚠️ Approval received — estimate not in an approvable state";
        }
      } catch (err) {
        logger.error("SMS auto-approve failed", err as Error, { traceId, targetId });
        actionLine = "⚠️ Approval received — review estimate manually";
      }
    } else {
      actionLine = "⚠️ Approval received — no open estimate found";
    }
  } else if (ai.message_type === "cancellation") {
    jobId = context.recentJobs.find((j) => ACTIVE_JOB_STATUSES.includes(j.status))?.id ?? null;
    actionLine = "❌ Cancellation flagged — review the job";
  } else {
    // follow_up / scheduling / question / other_business — link to active job if obvious
    jobId = context.recentJobs.find((j) => ACTIVE_JOB_STATUSES.includes(j.status))?.id ?? null;
  }

  // ── always log the inbound message ─────────────────────────────────────
  await logCommunication({
    accountId,
    channel: "sms",
    direction: "inbound",
    outcome: "replied",
    clientId,
    jobId,
    bodyPreview: message.slice(0, 1000),
    externalId: external_id ?? null,
  });

  logger.info("SMS ingested", { traceId, clientId, jobId, type: ai.message_type, estimateApprovedId });

  const notification = buildNotification(ai, { phone, clientName, isNewClient, actionLine });

  return NextResponse.json({
    client_id: clientId,
    job_id: jobId,
    message_type: ai.message_type,
    is_new_client: isNewClient,
    client_name: clientName,
    estimate_approved_id: estimateApprovedId,
    notification,
    reply: ai.reply,
  });
}
