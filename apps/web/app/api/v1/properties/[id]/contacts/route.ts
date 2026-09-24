import { NextRequest, NextResponse } from "next/server";
import { withRole, type AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { propertyContactBody } from "@/lib/properties/contacts";

export const dynamic = "force-dynamic";

function propertyId(request: NextRequest) {
  return request.nextUrl.pathname.match(/\/properties\/([^/]+)\/contacts/)?.[1] ?? "";
}

async function sessionClient(session: AuthSession) {
  const client = await getPool().connect();
  await client.query("BEGIN");
  await client.query(
    `SELECT set_config('app.current_user_id', $1, true),
            set_config('app.current_account_id', $2, true),
            set_config('app.current_role', $3, true)`,
    [session.userId, session.accountId, session.role],
  );
  return client;
}

export const GET = withRole(["owner", "admin"], async (request, session) => {
  const pid = propertyId(request);
  const client = await sessionClient(session);
  try {
    const property = await client.query(
      `SELECT id FROM properties WHERE id = $1 AND account_id = $2`,
      [pid, session.accountId],
    );
    if (!property.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    const { rows } = await client.query(
      `SELECT pc.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone
       FROM property_contacts pc
       LEFT JOIN clients c ON c.id = pc.client_id AND c.account_id = pc.account_id
       WHERE pc.property_id = $1 AND pc.account_id = $2
       ORDER BY pc.created_at ASC`,
      [pid, session.accountId],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: rows });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("[property contacts GET]", error, { traceId: session.traceId, propertyId: pid });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to list contacts", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const pid = propertyId(request);
  const parsed = propertyContactBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 422 },
    );
  }

  const client = await sessionClient(session);
  try {
    const property = await client.query(
      `SELECT id FROM properties WHERE id = $1 AND account_id = $2`,
      [pid, session.accountId],
    );
    if (!property.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    const data = parsed.data;
    if (data.client_id) {
      const registered = await client.query(
        `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
        [data.client_id, session.accountId],
      );
      if (!registered.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Registered contact not found", traceId: session.traceId } },
          { status: 422 },
        );
      }
    }
    const { rows } = await client.query(
      `INSERT INTO property_contacts
         (account_id, property_id, client_id, external_name, external_email, external_phone, notes, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        session.accountId,
        pid,
        data.client_id ?? null,
        data.external_name ?? null,
        data.external_email ?? null,
        data.external_phone ?? null,
        data.notes ?? null,
        data.role,
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("[property contacts POST]", error, { traceId: session.traceId, propertyId: pid });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create contact", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});
