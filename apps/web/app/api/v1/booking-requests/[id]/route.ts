import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const updateBookingRequestBody = z.object({
  status: z.enum(["reviewed", "cancelled", "converted"]),
  visit_id: z.string().uuid().optional(),
});

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

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const id = request.url.match(/\/booking-requests\/([^/]+)/)?.[1];

  if (!id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Booking request not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = updateBookingRequestBody.safeParse(body);

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
      { status: 422 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const existing = await client.query(
      `SELECT * FROM booking_requests WHERE id = $1 AND account_id = $2 FOR UPDATE`,
      [id, session.accountId]
    );

    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Booking request not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const old = existing.rows[0];
    if (old.status === "converted") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: {
            code: "IMMUTABLE_ENTITY",
            message: "Converted booking requests cannot be changed.",
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }

    let clientId = old.client_id as string | null;
    let propertyId = old.property_id as string | null;
    let jobId = old.job_id as string | null;
    let visitId = old.visit_id as string | null;

    if (parsed.data.status === "reviewed" && !jobId) {
      if (!clientId) {
        if (old.email) {
          const { rows } = await client.query<{ id: string }>(
            `SELECT id FROM clients WHERE account_id = $1 AND email = $2`,
            [session.accountId, old.email]
          );
          if (rows[0]) clientId = rows[0].id;
        }

        if (!clientId && old.phone) {
          const { rows } = await client.query<{ id: string }>(
            `SELECT id FROM clients WHERE account_id = $1 AND phone = $2`,
            [session.accountId, old.phone]
          );
          if (rows[0]) clientId = rows[0].id;
        }

        if (!clientId) {
          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO clients (account_id, name, email, phone)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [session.accountId, old.name, old.email ?? null, old.phone ?? null]
          );
          clientId = rows[0].id;
        }
      }

      if (!propertyId) {
        const { rows: existingProperties } = await client.query<{ id: string }>(
          `SELECT id FROM properties WHERE account_id = $1 AND client_id = $2 AND address = $3`,
          [session.accountId, clientId, old.address]
        );
        propertyId = existingProperties[0]?.id ?? null;

        if (!propertyId) {
          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO properties (account_id, client_id, name, address, city, state, zip)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              session.accountId,
              clientId,
              old.address,
              old.address,
              old.city ?? null,
              old.state ?? null,
              old.zip ?? null,
            ]
          );
          propertyId = rows[0].id;
        }
      }

      const categoryLabel = String(old.service_category)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const jobType = jobTypeMap[String(old.service_category)] || "custom";

      const { rows: jobRows } = await client.query<{ id: string }>(
        `INSERT INTO jobs (account_id, client_id, property_id, title, description, status, job_type, created_by)
         VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7)
         RETURNING id`,
        [
          session.accountId,
          clientId,
          propertyId,
          `${categoryLabel} - ${old.name}`,
          old.service_description,
          jobType,
          session.userId,
        ]
      );
      jobId = jobRows[0].id;
    }

    if (parsed.data.status === "converted") {
      if (!jobId) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "PRECONDITION_FAILED",
              message: "Review the booking request before converting it.",
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      if (!parsed.data.visit_id) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "visit_id is required when converting a booking request.",
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      const visit = await client.query<{ id: string }>(
        `SELECT id FROM visits
         WHERE id = $1 AND account_id = $2 AND job_id = $3`,
        [parsed.data.visit_id, session.accountId, jobId]
      );

      if (!visit.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "PRECONDITION_FAILED",
              message: "The selected visit does not belong to this booking request's job.",
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      visitId = parsed.data.visit_id;
    }

    const { rows } = await client.query(
      `UPDATE booking_requests
       SET status = $3,
           reviewed_by = $4,
           reviewed_at = COALESCE(reviewed_at, now()),
           client_id = COALESCE(client_id, $5),
           property_id = COALESCE(property_id, $6),
           job_id = COALESCE(job_id, $7),
           visit_id = COALESCE(visit_id, $8),
           updated_at = now()
       WHERE id = $1 AND account_id = $2
       RETURNING *`,
      [id, session.accountId, parsed.data.status, session.userId, clientId, propertyId, jobId, visitId]
    );
    const updated = rows[0];

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "booking_request",
      entity_id: id,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: old,
      new_value: updated,
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: updated });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[booking-requests PATCH]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update booking request", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
