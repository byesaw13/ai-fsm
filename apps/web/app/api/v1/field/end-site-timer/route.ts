import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@ai-fsm/log/web";

export const dynamic = "force-dynamic";

const SITE_TYPES = ["job_work", "estimate_visit", "follow_up", "warranty_callback"];

/** Close the active on-site activity timer and return duration summary. */
export const POST = withAuth(async (_request, session) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );

    const active = await client.query<{
      id: string;
      activity_type: string;
      started_at: string;
      entity_type: string | null;
      entity_id: string | null;
      client_name: string | null;
      property_address: string | null;
      job_id: string | null;
      visit_type: string | null;
    }>(
      `SELECT ae.id, ae.activity_type, ae.started_at::text,
              ae.entity_type, ae.entity_id,
              c.name AS client_name, p.address AS property_address,
              j.id AS job_id, v.visit_type
       FROM activity_entries ae
       LEFT JOIN visits v ON ae.entity_type = 'visit' AND v.id = ae.entity_id
       LEFT JOIN jobs j ON (
         (ae.entity_type = 'job' AND j.id = ae.entity_id)
         OR (ae.entity_type = 'visit' AND j.id = v.job_id)
       )
       LEFT JOIN clients c ON c.id = COALESCE(j.client_id, v.client_id)
       LEFT JOIN properties p ON p.id = COALESCE(j.property_id, v.property_id)
       WHERE ae.account_id = $1 AND ae.user_id = $2
         AND ae.ended_at IS NULL AND ae.voided_at IS NULL
         AND ae.activity_type = ANY($3::text[])
       FOR UPDATE`,
      [session.accountId, session.userId, SITE_TYPES],
    );

    if (active.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "No site timer running", traceId: session.traceId } },
        { status: 404 },
      );
    }

    const row = active.rows[0];
    await client.query(`UPDATE activity_entries SET ended_at = now() WHERE id = $1`, [row.id]);

    const durationMinutes = Math.max(
      1,
      Math.round((Date.now() - new Date(row.started_at).getTime()) / 60_000),
    );

    await client.query("COMMIT");

    const suggestEstimate =
      row.visit_type === "site_visit" || row.visit_type === "sales_walkthrough";

    return NextResponse.json({
      data: {
        durationMinutes,
        clientName: row.client_name,
        propertyAddress: row.property_address,
        jobId: row.job_id,
        visitId: row.entity_type === "visit" ? row.entity_id : null,
        suggestEstimate,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/field/end-site-timer error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to end site timer", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});