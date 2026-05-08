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

const ACCOUNT_ID = process.env.BOOKING_ACCOUNT_ID;

if (!ACCOUNT_ID) {
  logger.warn("BOOKING_ACCOUNT_ID is not set — booking submissions will fail");
}

export async function POST(request: NextRequest) {
  if (!ACCOUNT_ID) {
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

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check if client already exists (by email or phone)
    let clientId: string | null = null;
    if (data.email) {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM clients WHERE account_id = $1 AND email = $2`,
        [ACCOUNT_ID, data.email]
      );
      if (rows.length > 0) clientId = rows[0].id;
    }
    if (!clientId && data.phone) {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM clients WHERE account_id = $1 AND phone = $2`,
        [ACCOUNT_ID, data.phone]
      );
      if (rows.length > 0) clientId = rows[0].id;
    }

    // Create client if not found
    if (!clientId) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO clients (account_id, name, email, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [ACCOUNT_ID, data.name, data.email || null, data.phone || null]
      );
      clientId = rows[0].id;
    }

    // Check if property exists for this client at this address
    let propertyId: string | null = null;
    {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM properties WHERE client_id = $1 AND address = $2`,
        [clientId, data.address]
      );
      if (rows.length > 0) {
        propertyId = rows[0].id;
      }
    }

    if (!propertyId) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO properties (account_id, client_id, name, address, city, state, zip)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          ACCOUNT_ID,
          clientId,
          data.address,
          data.address,
          data.city || null,
          data.state || null,
          data.zip || null,
        ]
      );
      propertyId = rows[0].id;
    }

    // Determine job type from service category
    const jobTypeMap: Record<string, string> = {
      painting_finishes: "painting",
      maintenance_small: "maintenance",
      general_repairs: "repair",
      plumbing: "repair",
      electrical: "repair",
      carpentry_furniture: "custom",
      outdoor_seasonal: "maintenance",
      mounting_installs: "custom",
      specialty_expansion: "custom",
    };
    const jobType = jobTypeMap[data.service_category] || "custom";

    const categoryLabel = data.service_category
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // Create a job
    const { rows: jobRows } = await client.query<{ id: string }>(
      `INSERT INTO jobs (account_id, client_id, property_id, title, description, status, job_type)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6)
       RETURNING id`,
      [ACCOUNT_ID, clientId, propertyId, `${categoryLabel} — ${data.name}`, data.service_description, jobType]
    );
    const jobId = jobRows[0].id;

    // Create the booking request record.
    // Visit is NOT created here — staff create it after reviewing the request.
    const { rows: bookingRows } = await client.query<{ id: string }>(
      `INSERT INTO booking_requests
         (account_id, client_id, property_id, job_id,
          name, email, phone, service_category, service_description,
          preferred_date, preferred_time_slot, address, city, state, zip, access_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id`,
      [
        ACCOUNT_ID,
        clientId,
        propertyId,
        jobId,
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
