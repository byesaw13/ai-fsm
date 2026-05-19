import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createIntakeRecords } from "../../../../lib/intake/records";
import { bookingRequestStatusSchema } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const VALID_STATUSES = bookingRequestStatusSchema.options;

const quickLeadSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal("")),
  service_description: z.string().max(2000).optional(),
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON" } }, { status: 400 });
  }

  const parsed = quickLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const { name, phone, email, service_description } = parsed.data;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const { bookingId, clientId, propertyId, jobId } = await createIntakeRecords(client, {
      accountId: session.accountId,
      createdByUserId: session.userId,
      name,
      phone: phone ?? null,
      email: email || null,
      serviceCategory: "general_repairs",
      serviceDescription: service_description || "Quick lead captured for follow-up.",
      preferredDate: new Date().toISOString().slice(0, 10),
      preferredTimeSlot: "flexible",
      address: "TBD",
      preferredContact: phone ? "phone" : "email",
      smsConsent: false,
      smsConsentSource: "quick_lead",
    });

    await client.query("COMMIT");

    return NextResponse.json({ id: bookingId, clientId, propertyId, jobId }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error("POST /api/v1/booking-requests error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create lead", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const conditions: string[] = ["br.account_id = $1"];
    const params: unknown[] = [session.accountId];
    let idx = 2;

    if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
      conditions.push(`br.status = $${idx++}`);
      params.push(status);
    }

    params.push(limit);
    const rows = await client.query(
      `SELECT br.id, br.status, br.name, br.email, br.phone,
              br.service_category, br.service_description,
              br.preferred_date, br.preferred_time_slot,
              br.address, br.city, br.state, br.zip,
              br.review_notes, br.reviewed_at,
              br.job_id, br.visit_id, br.client_id,
              br.created_at,
              u.full_name AS reviewed_by_name
       FROM booking_requests br
       LEFT JOIN users u ON u.id = br.reviewed_by
       WHERE ${conditions.join(" AND ")}
       ORDER BY br.created_at DESC
       LIMIT $${idx}`,
      params
    );

    return NextResponse.json({ data: rows.rows });
  } catch (err) {
    logger.error("GET /api/v1/booking-requests error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to list booking requests", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
