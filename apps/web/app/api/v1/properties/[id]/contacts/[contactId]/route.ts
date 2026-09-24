import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { propertyContactBody } from "@/lib/properties/contacts";

export const dynamic = "force-dynamic";

function ids(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/\/properties\/([^/]+)\/contacts\/([^/]+)/);
  return { propertyId: match?.[1] ?? "", contactId: match?.[2] ?? "" };
}

export const PATCH = withRole(["owner", "admin"], async (request, session) => {
  const { propertyId, contactId } = ids(request);
  const parsed = propertyContactBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 422 },
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );
    const data = parsed.data;
    if (data.client_id) {
      const registered = await client.query(`SELECT id FROM clients WHERE id = $1 AND account_id = $2`, [data.client_id, session.accountId]);
      if (!registered.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Registered contact not found", traceId: session.traceId } },
          { status: 422 },
        );
      }
    }
    const { rows } = await client.query(
      `UPDATE property_contacts SET
         client_id = $4, external_name = $5, external_email = $6,
         external_phone = $7, notes = $8, role = $9
       WHERE id = $1 AND property_id = $2 AND account_id = $3
       RETURNING *`,
      [
        contactId,
        propertyId,
        session.accountId,
        data.client_id ?? null,
        data.external_name ?? null,
        data.external_email ?? null,
        data.external_phone ?? null,
        data.notes ?? null,
        data.role,
      ],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Contact not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("[property contacts PATCH]", error, { traceId: session.traceId, contactId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update contact", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});

export const DELETE = withRole(["owner", "admin"], async (request, session) => {
  const { propertyId, contactId } = ids(request);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );
    const result = await client.query(
      `DELETE FROM property_contacts WHERE id = $1 AND property_id = $2 AND account_id = $3`,
      [contactId, propertyId, session.accountId],
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Contact not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23503") {
      return NextResponse.json(
        { error: { code: "CONTACT_IN_USE", message: "Contact is used by an invoice", traceId: session.traceId } },
        { status: 409 },
      );
    }
    logger.error("[property contacts DELETE]", error, { traceId: session.traceId, contactId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete contact", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});
