import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createIntakeRecords } from "../../../lib/intake/records";
import { priceBookCategorySchema, scoreSiteVisitProbability } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const bookingSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  service_category: priceBookCategorySchema,
  service_description: z.string().min(10).max(2000),
  preferred_date: z.string().refine((val) => {
    const date = new Date(val);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  }, "Date must be today or in the future"),
  preferred_time_slot: z.enum(["morning", "afternoon", "evening"]).optional(),
  address: z.string().min(1).max(500),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(50).nullable().optional(),
  zip: z.string().max(20).nullable().optional(),
  access_notes: z.string().max(500).nullable().optional(),
  preferred_contact: z.enum(["sms", "email", "phone"]).default("email"),
  sms_consent: z.boolean().default(false),
  referral_source: z.enum(["online", "friend_neighbor", "realtor", "repeat", "other"]).nullable().optional(),
  referral_name: z.string().max(255).nullable().optional(),
  intake_metadata: z.record(z.string(), z.string()).nullable().optional(),
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

function getBookingAccountId(): string | null {
  return process.env.BOOKING_ACCOUNT_ID || null;
}

export async function POST(request: NextRequest) {
  const accountId = getBookingAccountId();
  if (!accountId) {
    logger.warn("BOOKING_ACCOUNT_ID is not set — booking submissions will fail");
    return NextResponse.json(
      { error: { message: "Booking is not currently available." } },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const parseResult = bookingSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: { message: "Invalid request body", details: parseResult.error.issues } },
      { status: 400 }
    );
  }

  const data = parseResult.data;

  const decision = scoreSiteVisitProbability({
    service_category: data.service_category,
    service_description: data.service_description,
    intake_metadata: data.intake_metadata || null,
  });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { bookingId } = await createIntakeRecords(client, {
      accountId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      serviceCategory: data.service_category,
      serviceDescription: data.service_description,
      preferredDate: data.preferred_date,
      preferredTimeSlot: data.preferred_time_slot || null,
      address: data.address,
      city: data.city || null,
      state: data.state || null,
      zip: data.zip || null,
      accessNotes: data.access_notes || null,
      preferredContact: data.preferred_contact,
      smsConsent: data.sms_consent,
      smsConsentSource: "booking_form",
      routingPath: decision.path,
      walkthroughScore: decision.score,
      referralSource: data.referral_source || null,
      referralName: data.referral_name || null,
      intakeMetadata: data.intake_metadata || null,
    });

    await client.query("COMMIT");

    return NextResponse.json(
      { success: true, booking_id: bookingId, routing_path: decision.path },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/booking error", error as Error);
    return NextResponse.json(
      { error: { message: "Failed to submit booking request." } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
