import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// ── env ─────────────────────────────────────────────────────────────────────
const SMS_KEY = process.env.SMS_INTERNAL_KEY;

// ── message classification ────────────────────────────────────────────────
// new_inquiry      → a brand new job request (also creates a draft job)
// cancellation     → customer cancelling/declining
// approval         → customer approving an estimate / saying yes
// follow_up        → checking in on existing work
// scheduling       → about timing / availability / rescheduling
// question         → a general question about existing or potential work
// other_business   → business-relevant but none of the above
const MESSAGE_TYPES = [
  "new_inquiry",
  "cancellation",
  "approval",
  "follow_up",
  "scheduling",
  "question",
  "other_business",
] as const;

// ── schema ───────────────────────────────────────────────────────────────────
const bodySchema = z.object({
  phone: z.string().min(7).max(20),
  message: z.string().min(1).max(2000),
  external_id: z.string().max(255).optional(),
  ai: z.object({
    is_business: z.boolean(),
    message_type: z.enum(MESSAGE_TYPES).optional().default("other_business"),
    customer_name: z.string().nullable().optional(),
    job_title: z.string().optional(),
    job_type: z
      .enum([
        "repair", "maintenance", "carpentry", "painting", "flooring",
        "windows_doors", "electrical", "plumbing", "hvac", "appliances",
        "drywall", "landscaping", "custom",
      ])
      .optional()
      .default("custom"),
    description: z.string().optional(),
  }),
});

// ── auto-discover owner account on first call ─────────────────────────────
let _accountId: string | null = null;
let _userId: string | null = null;

async function getOwnerContext(): Promise<{ accountId: string; userId: string }> {
  if (_accountId && _userId) return { accountId: _accountId, userId: _userId };

  const row = await queryOne<{ account_id: string; user_id: string }>(
    `SELECT a.id AS account_id, u.id AS user_id
     FROM accounts a
     JOIN users u ON u.account_id = a.id
     WHERE u.role = 'owner'
     ORDER BY u.created_at
     LIMIT 1`,
  );

  if (!row) throw new Error("No owner account found in database");
  _accountId = row.account_id;
  _userId = row.user_id;
  return { accountId: _accountId, userId: _userId };
}

// ── POST /api/internal/sms ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const traceId = randomUUID();

  // Auth
  const key = req.headers.get("x-api-key");
  if (!SMS_KEY || key !== SMS_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
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
      { status: 422 },
    );
  }

  const { phone, message, external_id, ai } = parsed.data;

  // Non-business messages (spam, wrong numbers) — acknowledge but skip
  if (!ai.is_business) {
    logger.info("SMS not a business inquiry — skipping", { traceId, phone });
    return NextResponse.json({ skipped: true, reason: "not_business" });
  }

  // Discover owner account
  let accountId: string, userId: string;
  try {
    ({ accountId, userId } = await getOwnerContext());
  } catch (err) {
    logger.error("Failed to resolve owner context", err as Error, { traceId });
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Find or create client by phone number
  const existing = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM clients
     WHERE account_id = $1 AND phone = $2
     LIMIT 1`,
    [accountId, phone],
  );

  let clientId: string;
  let clientName: string;
  let isNewClient: boolean;

  if (existing) {
    clientId = existing.id;
    clientName = existing.name;
    isNewClient = false;
    logger.info("Matched existing client", { traceId, clientId, phone });
  } else {
    const [created] = await query<{ id: string }>(
      `INSERT INTO clients (account_id, name, phone, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        accountId,
        ai.customer_name ?? `SMS Lead (${phone})`,
        phone,
        `Created automatically from SMS.\n\nFirst message: "${message}"`,
      ],
    );
    clientId = created.id;
    clientName = ai.customer_name ?? `SMS Lead (${phone})`;
    isNewClient = true;
    logger.info("Created new client from SMS", { traceId, clientId, phone });
  }

  // Only new inquiries spin up a draft job
  let jobId: string | null = null;
  if (ai.message_type === "new_inquiry") {
    const jobTitle = ai.job_title ?? "SMS Inquiry";
    const jobDescription = [
      `Original SMS: "${message}"`,
      ai.description ? `\nDetails: ${ai.description}` : "",
    ]
      .filter(Boolean)
      .join("");

    const [job] = await query<{ id: string }>(
      `INSERT INTO jobs
         (account_id, client_id, title, description, status, job_type, created_by)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6)
       RETURNING id`,
      [accountId, clientId, jobTitle, jobDescription, ai.job_type ?? "custom", userId],
    );
    jobId = job.id;
  }

  // Always log the inbound message so the client's communication history is complete
  await query(
    `INSERT INTO communications_log
       (account_id, client_id, job_id, channel, direction, outcome, body_preview, external_id)
     VALUES ($1, $2, $3, 'sms', 'inbound', 'replied', $4, $5)`,
    [accountId, clientId, jobId, message.slice(0, 1000), external_id ?? null],
  );

  logger.info("SMS ingested", {
    traceId,
    clientId,
    jobId,
    messageType: ai.message_type,
    isNewClient,
  });

  return NextResponse.json({
    client_id: clientId,
    job_id: jobId,
    message_type: ai.message_type,
    is_new_client: isNewClient,
    client_name: clientName,
  });
}
