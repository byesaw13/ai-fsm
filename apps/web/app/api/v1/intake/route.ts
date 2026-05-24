import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createIntakeRecords } from "../../../../lib/intake/records";
import { scoreSiteVisitProbability } from "@ai-fsm/domain";

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

  const decision = scoreSiteVisitProbability({
    service_category: data.service_category,
    service_description: data.service_description,
  });

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

    const { bookingId, clientId, propertyId, jobId, routingPath } = await createIntakeRecords(client, {
      accountId: session.accountId,
      createdByUserId: session.userId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      serviceCategory: data.service_category,
      serviceDescription: data.service_description,
      preferredDate: data.preferred_date,
      preferredTimeSlot: data.preferred_time_slot,
      address: data.address,
      city: data.city || null,
      preferredContact: data.preferred_contact,
      smsConsent: data.sms_consent,
      smsConsentSource: "staff_intake",
      routingPath: decision.path,
      walkthroughScore: decision.score,
    });

    await client.query("COMMIT");
    return NextResponse.json(
      { id: bookingId, clientId, propertyId, jobId, routing_path: routingPath, walkthrough_score: decision.score },
      { status: 201 }
    );
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
