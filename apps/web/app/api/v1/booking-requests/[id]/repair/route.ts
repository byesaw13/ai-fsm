import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { repairBookingRequestPipelineLinks } from "../../../../../../lib/intake/records";

export const dynamic = "force-dynamic";

function extractId(url: string) {
  return url.match(/\/booking-requests\/([^/]+)\/repair/)?.[1] ?? null;
}

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const id = extractId(request.url);
  if (!id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

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

    const { rows } = await client.query(
      `SELECT *
       FROM booking_requests
       WHERE id = $1 AND account_id = $2
       FOR UPDATE`,
      [id, session.accountId]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Booking request not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const br = rows[0];
    if (br.status === "converted") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Already converted", traceId: session.traceId } },
        { status: 409 }
      );
    }
    if (br.status === "cancelled") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Cannot repair a cancelled request", traceId: session.traceId } },
        { status: 409 }
      );
    }

    const repaired = await repairBookingRequestPipelineLinks(client, {
      id,
      accountId: session.accountId,
      createdByUserId: session.userId,
      clientId: br.client_id,
      propertyId: br.property_id,
      jobId: br.job_id,
      name: br.name,
      email: br.email,
      phone: br.phone,
      serviceCategory: br.service_category,
      serviceDescription: br.service_description,
      preferredDate: br.preferred_date,
      preferredTimeSlot: br.preferred_time_slot,
      address: br.address,
      city: br.city,
      state: br.state,
      zip: br.zip,
      accessNotes: br.access_notes,
      preferredContact: br.preferred_contact,
      smsConsent: br.sms_consent,
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: repaired }, { status: 200 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error("POST /api/v1/booking-requests/[id]/repair error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create project", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
