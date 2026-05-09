import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const intakeSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  service_category: z.enum([
    "general_repairs",
    "plumbing",
    "electrical",
    "carpentry_furniture",
    "painting_finishes",
    "outdoor_seasonal",
    "mounting_installs",
    "maintenance_small",
    "specialty_expansion",
  ]),
  service_description: z.string().min(10).max(2000),
  preferred_date: z.string().refine((val) => {
    const date = new Date(val);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  }, "Date must be today or in the future"),
  preferred_time_slot: z.enum(["morning", "afternoon", "evening", "flexible"]).default("flexible"),
  address: z.string().min(1).max(500),
  city: z.string().max(100).nullable().optional(),
  preferred_contact: z.enum(["sms", "email", "phone"]).default("email"),
  sms_consent: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.preferred_contact === "sms") {
    if (!data.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Phone is required when SMS is the preferred contact method",
      });
    }
    if (!data.sms_consent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sms_consent"],
        message: "SMS consent is required when SMS is the preferred contact method",
      });
    }
  }
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const body = await request.json().catch(() => null);
  const parsed = intakeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const data = parsed.data;
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

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO booking_requests (
         account_id, name, email, phone, service_category, service_description,
         preferred_date, preferred_time_slot, address, city,
         preferred_contact, sms_consent, sms_consent_at, sms_consent_source
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11, $12, CASE WHEN $12 THEN NOW() ELSE NULL END, CASE WHEN $12 THEN $13 ELSE NULL END)
       RETURNING id`,
      [
        session.accountId,
        data.name,
        data.email || null,
        data.phone || null,
        data.service_category,
        data.service_description,
        data.preferred_date,
        data.preferred_time_slot,
        data.address,
        data.city || null,
        data.preferred_contact,
        data.sms_consent,
        "staff_intake",
      ]
    );
    const bookingId = rows[0].id;

    const { rows: duplicateRows } = await client.query<{ id: string }>(
      `SELECT id FROM booking_requests
       WHERE account_id = $1
         AND id != $2
         AND status NOT IN ('cancelled','converted')
         AND created_at > NOW() - INTERVAL '90 days'
         AND (
           (email IS NOT NULL AND email = $3) OR
           (phone IS NOT NULL AND phone = $4) OR
           (lower(name) = lower($5))
         )
       LIMIT 5`,
      [
        session.accountId,
        bookingId,
        data.email || null,
        data.phone || null,
        data.name,
      ]
    );

    if (duplicateRows.length > 0) {
      await client.query(
        `UPDATE booking_requests
         SET duplicate_candidate_ids = $1
         WHERE id = $2 AND account_id = $3`,
        [duplicateRows.map((row) => row.id), bookingId, session.accountId]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ id: bookingId }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/intake error", err as Error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create booking request", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
