import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bookingSchema = z.object({
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
  preferred_time_slot: z.enum(["morning", "afternoon", "evening"]).optional(),
  address: z.string().min(1).max(500),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(50).nullable().optional(),
  zip: z.string().max(20).nullable().optional(),
  access_notes: z.string().max(500).nullable().optional(),
});

type QueryableClient = {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

async function resolveBookingAccountId(client: QueryableClient): Promise<string | null> {
  const configuredAccountId = process.env.BOOKING_ACCOUNT_ID;
  if (configuredAccountId) {
    return configuredAccountId;
  }

  const { rows } = await client.query<{ id: string }>(
    `SELECT id
       FROM accounts
      ORDER BY created_at ASC
      LIMIT 2`
  );

  if (rows.length === 1) {
    return rows[0].id;
  }

  logger.warn("BOOKING_ACCOUNT_ID is not set and a single booking account could not be inferred", {
    accountCount: rows.length,
  });
  return null;
}

export async function POST(request: NextRequest) {
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

  const pool = getPool();
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const accountId = await resolveBookingAccountId(client);
    if (!accountId) {
      return NextResponse.json(
        { error: { message: "Booking is not currently available." } },
        { status: 503 }
      );
    }

    await client.query("BEGIN");
    transactionStarted = true;

    // Public booking captures an intake request only. Staff review creates
    // the client/property/job records and scheduling remains explicit.
    const { rows: bookingRows } = await client.query<{ id: string }>(
      `INSERT INTO booking_requests
         (account_id, client_id, property_id, job_id, visit_id,
          name, email, phone, service_category, service_description,
          preferred_date, preferred_time_slot, address, city, state, zip, access_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id`,
      [
        accountId,
        null,
        null,
        null,
        null,
        data.name,
        data.email || null,
        data.phone || null,
        data.service_category,
        data.service_description,
        data.preferred_date,
        data.preferred_time_slot || null,
        data.address,
        data.city || null,
        data.state || null,
        data.zip || null,
        data.access_notes || null,
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      { success: true, booking_id: bookingRows[0].id },
      { status: 201 }
    );
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    logger.error("POST /api/booking error", error as Error);
    return NextResponse.json(
      { error: { message: "Failed to submit booking request." } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
