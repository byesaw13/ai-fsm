import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getPool, queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";
import { DETECTED_ACTIVITIES, LOCATION_EVENT_KINDS, classifyDrive, haversineMeters, pathDistanceMeters } from "@ai-fsm/domain";
import { reduceLocationEvent, type OpenSegment } from "@/lib/location/segments";

export const dynamic = "force-dynamic";

// TASK-024: ingest endpoint for location transitions from the Home Assistant
// Companion app (bridged via n8n/MQTT). Authenticated by a dedicated internal
// key — the PWA itself cannot produce background location, so this is the feed.
const LOCATION_KEY = process.env.LOCATION_INTERNAL_KEY;

const bodySchema = z.object({
  kind: z.enum(LOCATION_EVENT_KINDS),
  occurred_at: z.string().datetime().optional(),
  zone: z.string().max(120).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  geocoded_address: z.string().max(500).nullish(),
  detected_activity: z.enum(DETECTED_ACTIVITIES).nullish(),
  external_id: z.string().max(255).optional(),
  // TASK-025: car-stereo BT id (MAC) on vehicle_connect → resolves the vehicle.
  vehicle_bluetooth: z.string().max(120).nullish(),
});

// ── owner account discovery (cached; single-owner model, mirrors SMS ingest) ──
let _accountId: string | null = null;
async function getOwnerAccountId(): Promise<string> {
  if (_accountId) return _accountId;
  const row = await queryOne<{ account_id: string }>(
    `SELECT a.id AS account_id
     FROM accounts a JOIN users u ON u.account_id = a.id
     WHERE u.role = 'owner' ORDER BY u.created_at LIMIT 1`,
  );
  if (!row) throw new Error("No owner account found in database");
  _accountId = row.account_id;
  return _accountId;
}

type SegmentRow = {
  id: string;
  kind: "stop" | "drive";
  started_at: string;
  ended_at: string | null;
  zone: string | null;
  place_label: string | null;
  latitude: number | null;
  longitude: number | null;
  suggested_activity_type: string | null;
  status: string;
  vehicle_id: string | null;
};

// POST /api/internal/location — record one HA location event, update segments.
export async function POST(req: NextRequest) {
  const traceId = randomUUID();

  if (!LOCATION_KEY || req.headers.get("x-api-key") !== LOCATION_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const data = parsed.data;
  const occurredAt = data.occurred_at ?? new Date().toISOString();

  let accountId: string;
  try {
    accountId = await getOwnerAccountId();
  } catch (err) {
    logger.error("location ingest: owner context failed", err as Error, { traceId });
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Idempotency: HA may retry the same event.
  if (data.external_id) {
    const seen = await queryOne<{ id: string }>(
      `SELECT id FROM location_events WHERE account_id = $1 AND external_id = $2 LIMIT 1`,
      [accountId, data.external_id],
    );
    if (seen) {
      logger.info("location event duplicate ignored", { traceId, external_id: data.external_id });
      return NextResponse.json({ duplicate: true });
    }
  }

  // Persist the event and apply segment mutations atomically. A single
  // transaction keeps the raw event and its derived segment changes consistent
  // (the bot's P2), and `FOR UPDATE` on the open segment serializes concurrent
  // transitions against the one-open invariant. We also set the RLS session
  // context for the resolved owner so the writes are correct whether or not the
  // app DB role bypasses RLS (the bot's P1).
  const client = await getPool().connect();
  let mutOpenKind: string | null = null;
  let mutClosed = false;
  let segmentId: string | null = null;
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_account_id', $1, true),
              set_config('app.current_role', 'owner', true)`,
      [accountId],
    );

    // 1. Raw event (append-only feed).
    await client.query(
      `INSERT INTO location_events
         (account_id, occurred_at, kind, zone, latitude, longitude,
          geocoded_address, detected_activity, external_id, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        accountId,
        occurredAt,
        data.kind,
        data.zone ?? null,
        data.latitude ?? null,
        data.longitude ?? null,
        data.geocoded_address ?? null,
        data.detected_activity ?? null,
        data.external_id ?? null,
        JSON.stringify(body),
      ],
    );

    // Resolve which vehicle a vehicle_connect refers to (match the BT id/MAC
    // against vehicles.bluetooth_id; tolerant of a stored "MAC (Name)" string).
    let resolvedVehicleId: string | null = null;
    if (data.kind === "vehicle_connect" && data.vehicle_bluetooth) {
      const { rows: veh } = await client.query<{ id: string }>(
        `SELECT id FROM vehicles
         WHERE account_id = $1 AND bluetooth_id IS NOT NULL
           AND (bluetooth_id = $2 OR bluetooth_id ILIKE '%' || $2 || '%')
         LIMIT 1`,
        [accountId, data.vehicle_bluetooth],
      );
      resolvedVehicleId = veh[0]?.id ?? null;
    }

    // 2. Currently-open segment (locked) → reducer.
    const { rows: openRows } = await client.query<SegmentRow>(
      `SELECT id, kind, started_at::text, ended_at::text, zone, place_label,
              latitude, longitude, suggested_activity_type, status, vehicle_id
       FROM location_segments
       WHERE account_id = $1 AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1
       FOR UPDATE`,
      [accountId],
    );
    const openRow = openRows[0] ?? null;
    const open: OpenSegment | null = openRow
      ? {
          id: openRow.id,
          kind: openRow.kind,
          startedAt: openRow.started_at,
          zone: openRow.zone,
          placeLabel: openRow.place_label,
          latitude: openRow.latitude,
          longitude: openRow.longitude,
          vehicleId: openRow.vehicle_id,
        }
      : null;
    segmentId = open?.id ?? null;

    const mut = reduceLocationEvent(open, {
      kind: data.kind,
      occurredAt,
      zone: data.zone ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      geocodedAddress: data.geocoded_address ?? null,
      detectedActivity: data.detected_activity ?? null,
      vehicleId: resolvedVehicleId,
    });
    mutOpenKind = mut.open?.kind ?? null;
    mutClosed = Boolean(mut.closeOpen);

    // 3. Apply. Close BEFORE open so the one-open invariant always holds.
    if (mut.closeOpen && open) {
      // For a closing drive, estimate distance by accumulating great-circle
      // legs over the GPS points captured during the drive (periodic location
      // updates make this realistic; with only endpoints it's a straight line).
      // An estimate the owner confirms/edits before it becomes mileage.
      let distanceMeters: number | null = null;
      if (open.kind === "drive") {
        const { rows: pts } = await client.query<{ latitude: number; longitude: number }>(
          `SELECT latitude, longitude FROM location_events
           WHERE account_id = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL
             AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
           ORDER BY occurred_at ASC`,
          [accountId, open.startedAt, mut.closeOpen.endedAt],
        );
        if (pts.length >= 2) {
          distanceMeters = pathDistanceMeters(pts.map((p) => ({ latitude: p.latitude, longitude: p.longitude })));
        } else if (open.latitude != null && open.longitude != null && data.latitude != null && data.longitude != null) {
          distanceMeters = haversineMeters(
            { latitude: open.latitude, longitude: open.longitude },
            { latitude: data.latitude, longitude: data.longitude },
          );
        }
      }
      // Classify a closing drive by average speed: auto-dismiss the obvious
      // noise (parked Bluetooth cycle, GPS drift, sub-minute blip) and flag the
      // borderline so the owner can clear it in one tap. Shared rule:
      // classifyDrive (packages/domain). Stops are never classified.
      let isLikelyNoise = false;
      let dismissAsNoise = false;
      if (open.kind === "drive") {
        const durationSeconds =
          (new Date(mut.closeOpen.endedAt).getTime() - new Date(open.startedAt).getTime()) / 1000;
        const cls = classifyDrive({ distanceMeters, durationSeconds });
        isLikelyNoise = cls !== "ok";
        dismissAsNoise = cls === "noise";
      }
      await client.query(
        `UPDATE location_segments
         SET ended_at = $1,
             distance_meters = COALESCE($4, distance_meters),
             is_likely_noise = $5,
             status = CASE WHEN $6 THEN 'dismissed' ELSE status END,
             updated_at = now()
         WHERE id = $2 AND account_id = $3 AND ended_at IS NULL`,
        [mut.closeOpen.endedAt, open.id, accountId, distanceMeters, isLikelyNoise, dismissAsNoise],
      );
    }
    if (mut.updateOpen && open) {
      const u = mut.updateOpen;
      await client.query(
        `UPDATE location_segments SET
           place_label = COALESCE($1, place_label),
           zone        = COALESCE($2, zone),
           latitude    = COALESCE($3, latitude),
           longitude   = COALESCE($4, longitude),
           vehicle_id  = COALESCE($5, vehicle_id),
           updated_at  = now()
         WHERE id = $6 AND account_id = $7 AND ended_at IS NULL`,
        [u.placeLabel ?? null, u.zone ?? null, u.latitude ?? null, u.longitude ?? null, u.vehicleId ?? null, open.id, accountId],
      );
    }
    if (mut.open) {
      const o = mut.open;
      // segment_date derives from the event's own timestamp, not the server's
      // current date, so backfilled/retried events land on the right day (P2).
      const { rows: ins } = await client.query<{ id: string }>(
        `INSERT INTO location_segments
           (account_id, segment_date, kind, started_at, zone, place_label,
            latitude, longitude, suggested_activity_type, vehicle_id)
         VALUES ($1, ($2::timestamptz)::date, $3, $2, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [accountId, o.startedAt, o.kind, o.zone, o.placeLabel, o.latitude, o.longitude, o.suggestedActivityType, o.vehicleId],
      );
      segmentId = ins[0]?.id ?? segmentId;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("location ingest: transaction failed", err as Error, { traceId });
    return NextResponse.json({ error: "Failed to record location event" }, { status: 500 });
  } finally {
    client.release();
  }

  logger.info("location event ingested", {
    traceId,
    kind: data.kind,
    transition: mutOpenKind ? `open_${mutOpenKind}` : "none",
  });

  return NextResponse.json({
    ok: true,
    current_segment_id: segmentId,
    opened: mutOpenKind,
    closed: mutClosed,
  });
}
