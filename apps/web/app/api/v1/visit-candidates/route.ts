import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { queryForSession, getPool } from "@/lib/db";
import { canViewReports } from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";
import {
  VISIT_CLASSIFICATIONS,
  CLASSIFICATION_TO_ACTIVITY,
  activityCategoryFor,
  type VisitClassification,
} from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

// EPIC-007: pending detected visits for owner review. Owner/admin only — these
// are account-wide records, like the activity ledger.

type CandidateRow = {
  id: string;
  status: string;
  confidence_score: number;
  distance_meters: number | null;
  arrival_time: string;
  departure_time: string;
  duration_minutes: number;
  classification: string | null;
  property_id: string | null;
  property_address: string | null;
  client_id: string | null;
  client_name: string | null;
  job_id: string | null;
  visit_id: string | null;
};

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (!canViewReports(session.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Not permitted", traceId: session.traceId } },
      { status: 403 },
    );
  }
  try {
    const dateParam = request.nextUrl.searchParams.get("date");
    const day = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
    const rows = await queryForSession<CandidateRow>(
      session,
      `SELECT vc.id, vc.status, vc.confidence_score, vc.distance_meters,
              vc.arrival_time::text, vc.departure_time::text, vc.duration_minutes,
              vc.classification, vc.property_id, p.address AS property_address,
              vc.matched_client_id AS client_id, c.name AS client_name,
              vc.job_id, vc.visit_id
       FROM visit_candidates vc
       LEFT JOIN properties p ON p.id = vc.property_id
       LEFT JOIN clients c ON c.id = vc.matched_client_id
       WHERE vc.account_id = $1
         AND vc.status = 'pending'
         AND vc.arrival_time::date = COALESCE($2::date, CURRENT_DATE)
       ORDER BY vc.arrival_time ASC`,
      [session.accountId, day],
    );
    return NextResponse.json({ data: { candidates: rows } });
  } catch (error) {
    logger.error("GET /api/v1/visit-candidates error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load visit candidates", traceId: session.traceId } },
      { status: 500 },
    );
  }
});

// POST — "I'm at customer site": manually record a confirmed visit when GPS
// missed or the address is new. Writes the ledger entry directly (no stop) and,
// if coordinates are supplied, learns the property's geofence center.
const createSchema = z.object({
  client_id: z.string().uuid(),
  property_id: z.string().uuid().nullish(),
  classification: z.enum(VISIT_CLASSIFICATIONS).refine((c) => c !== "ignore", "classification cannot be ignore"),
  duration_minutes: z.number().int().min(1).max(720).default(30),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  note: z.string().max(500).nullish(),
});

function err(code: string, message: string, status: number, traceId: string) {
  return NextResponse.json({ error: { code, message, traceId } }, { status });
}

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (!canViewReports(session.role)) {
    return err("FORBIDDEN", "Not permitted", 403, session.traceId);
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", traceId: session.traceId, details: parsed.error.flatten().fieldErrors } },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const classification = d.classification as Exclude<VisitClassification, "ignore">;
  const activityType = CLASSIFICATION_TO_ACTIVITY[classification];
  const category = activityCategoryFor(activityType);

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );

    // Validate the client (and property, if given) belong to this account.
    const cli = await client.query(`SELECT id FROM clients WHERE id = $1 AND account_id = $2`, [d.client_id, session.accountId]);
    if (cli.rowCount === 0) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", "Unknown client", 400, session.traceId);
    }
    if (d.property_id) {
      const prop = await client.query(
        `SELECT id FROM properties WHERE id = $1 AND account_id = $2 AND client_id = $3`,
        [d.property_id, session.accountId, d.client_id],
      );
      if (prop.rowCount === 0) {
        await client.query("ROLLBACK");
        return err("VALIDATION_ERROR", "Property does not belong to that client", 400, session.traceId);
      }
    }

    const departure = new Date();
    const arrival = new Date(departure.getTime() - d.duration_minutes * 60_000);

    const { rows: ins } = await client.query<{ id: string }>(
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          started_at, ended_at, entity_type, entity_id, source, note)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, 'client', $8, 'manual', $9)
       RETURNING id`,
      [session.accountId, session.userId, arrival.toISOString(), activityType, category,
       arrival.toISOString(), departure.toISOString(), d.client_id, d.note ?? null],
    );
    const entryId = ins[0].id;

    const { rows: cand } = await client.query<{ id: string }>(
      `INSERT INTO visit_candidates
         (account_id, location_segment_id, property_id, matched_client_id,
          confidence_score, arrival_time, departure_time, duration_minutes,
          status, classification, activity_entry_id, source)
       VALUES ($1, NULL, $2, $3, 100, $4, $5, $6, 'confirmed', $7, $8, 'manual')
       RETURNING id`,
      [session.accountId, d.property_id ?? null, d.client_id,
       arrival.toISOString(), departure.toISOString(), d.duration_minutes, classification, entryId],
    );

    // Learn-on-confirm: seed the property's coords from the supplied GPS if it
    // has none yet.
    if (d.property_id && d.latitude != null && d.longitude != null) {
      await client.query(
        `UPDATE properties
         SET latitude = $1, longitude = $2, coordinate_source = 'manual',
             coordinate_confidence = 'manual', coordinate_updated_at = now(), updated_at = now()
         WHERE id = $3 AND account_id = $4 AND latitude IS NULL`,
        [d.latitude, d.longitude, d.property_id, session.accountId],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { id: cand[0].id, status: "confirmed", activity_entry_id: entryId } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/v1/visit-candidates error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to record visit", 500, session.traceId);
  } finally {
    client.release();
  }
});
