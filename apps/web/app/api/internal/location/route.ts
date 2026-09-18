import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getPool, queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  DETECTED_ACTIVITIES,
  LOCATION_EVENT_KINDS,
  classifyDrive,
  classifyStop,
  haversineMeters,
  pathDistanceMeters,
  rankVisitCandidates,
  shouldCreateVisitCandidate,
  resolveWorkOrderForProperty,
  isLivePromptEligible,
  shouldAutoStampPresence,
  resolveLocationPersonUserId,
  shouldLearnHomeCoords,
} from "@ai-fsm/domain";
import type { PoolClient } from "pg";
import { reduceLocationEvent, stopsAreSamePlace, type OpenSegment } from "@/lib/location/segments";
import { sendPushToUser, sendPushToOwners } from "@/lib/push/send";
import {
  applyGpsPresenceToVisit,
  autoRecordScheduledVisitPresence,
  shouldCompleteVisitFromPresence,
} from "@/lib/field/confirm-visit";
import { listOpenWorkOrdersAtProperty } from "@/lib/field/open-work-orders";
import {
  isDifferentPropertyStill,
  relocationRadiusForStop,
  type PropertyGeo,
} from "@/lib/field/stop-proximity";
import { stampLivePromptedAt } from "@/lib/field/stamp-live-prompted";

export const dynamic = "force-dynamic";

// TASK-024: ingest endpoint for location transitions from the Home Assistant
// Companion app (bridged via n8n/MQTT). Authenticated by a dedicated internal
// key — the PWA itself cannot produce background location, so this is the feed.
const LOCATION_KEY = process.env.LOCATION_INTERNAL_KEY;

/** JSON map of HA person/device id → users.id (thin multi-tech stamp identity). */
function loadLocationPersonMap(): Record<string, string> {
  const raw = process.env.LOCATION_PERSON_MAP;
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // ignore invalid env
  }
  return {};
}

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
  // Thin multi-tech: HA person entity or device label → LOCATION_PERSON_MAP.
  person: z.string().max(120).nullish(),
  device_id: z.string().max(120).nullish(),
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

  // Privacy gating (TASK-046): only capture when tracking is enabled, not
  // paused, and an active Start-Day workday session exists for the event's date.
  // Otherwise drop the event entirely — nothing is stored off-workday.
  const gate = await queryOne<{ enabled: boolean; paused: boolean; active_session: boolean }>(
    `SELECT a.location_tracking_enabled AS enabled,
            (a.location_paused_until IS NOT NULL AND a.location_paused_until > now()) AS paused,
            EXISTS (
              SELECT 1 FROM vehicle_sessions vs
              WHERE vs.account_id = a.id
                AND vs.session_date = ($2::timestamptz)::date
                AND vs.ended_at IS NULL
            ) AS active_session
     FROM accounts a WHERE a.id = $1`,
    [accountId, occurredAt],
  );
  const ignored = !gate?.enabled ? "tracking_disabled"
    : gate.paused ? "paused"
    : !gate.active_session ? "no_active_workday"
    : null;
  if (ignored) {
    logger.info("location event dropped by privacy gate", { traceId, reason: ignored });
    return NextResponse.json({ ok: true, ignored });
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
  let arrivalPrompt: ArrivalPromptPayload | null = null;
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

    // TASK-148: learn home coords from HA zone "home" so a geocoded street
    // address at the shop/house stays private.
    const { rows: homeRows } = await client.query<{
      home_latitude: number | null;
      home_longitude: number | null;
    }>(
      `SELECT home_latitude, home_longitude FROM accounts WHERE id = $1`,
      [accountId],
    );
    const storedHome =
      homeRows[0]?.home_latitude != null && homeRows[0]?.home_longitude != null
        ? { latitude: homeRows[0].home_latitude, longitude: homeRows[0].home_longitude }
        : null;
    const learnHome = shouldLearnHomeCoords({
      zone: data.zone ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      stored: storedHome,
    });
    if (learnHome.learn && data.latitude != null && data.longitude != null) {
      await client.query(
        `UPDATE accounts
            SET home_latitude = $2, home_longitude = $3, updated_at = now()
          WHERE id = $1`,
        [accountId, data.latitude, data.longitude],
      );
    }

    let relocationRadiusM: number | undefined;
    let geos: PropertyGeo[] = [];
    if (open?.kind === "stop" && open.latitude != null && open.longitude != null) {
      const { rows: props } = await client.query<{
        id: string;
        client_id: string;
        address: string | null;
        latitude: number;
        longitude: number;
        geofence_radius_feet: number;
      }>(
        `SELECT p.id, p.client_id, p.address, p.latitude, p.longitude, p.geofence_radius_feet
           FROM properties p
          WHERE p.account_id = $1 AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL`,
        [accountId],
      );
      geos = props.map((p) => ({
        propertyId: p.id,
        clientId: p.client_id,
        clientName: "",
        address: p.address ?? "",
        latitude: p.latitude,
        longitude: p.longitude,
        geofenceRadiusFeet: p.geofence_radius_feet,
      }));
      relocationRadiusM = relocationRadiusForStop(open, geos);
    }

    let differentProperty = false;
    if (
      data.kind === "activity_change" &&
      data.detected_activity === "still" &&
      open?.kind === "stop" &&
      open.latitude != null &&
      open.longitude != null &&
      data.latitude != null &&
      data.longitude != null
    ) {
      differentProperty = isDifferentPropertyStill(
        { latitude: open.latitude, longitude: open.longitude },
        { latitude: data.latitude, longitude: data.longitude },
        geos,
        relocationRadiusM ?? relocationRadiusForStop(open, geos),
      );
    }

    const mut = reduceLocationEvent(
      open,
      {
        kind: data.kind,
        occurredAt,
        zone: data.zone ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        geocodedAddress: data.geocoded_address ?? null,
        detectedActivity: data.detected_activity ?? null,
        vehicleId: resolvedVehicleId,
      },
      { relocationRadiusM, differentProperty },
    );
    mutOpenKind = mut.open?.kind ?? null;
    mutClosed = Boolean(mut.closeOpen);

    // 3. Apply. Close BEFORE open so the one-open invariant always holds.
    // Hoisted so the blip-coalescing step below (after the close) can tell
    // whether the drive that just closed was a sub-minute noise blip.
    let driveDismissedAsNoise = false;
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
      // Classify a closing segment. Drives: average speed (parked Bluetooth,
      // GPS drift, sub-minute blip). Stops: 5-minute dwell floor — HA still/
      // zone flicker is not a review item. Shared rules in packages/domain.
      const durationSeconds =
        (new Date(mut.closeOpen.endedAt).getTime() - new Date(open.startedAt).getTime()) / 1000;
      let isLikelyNoise = false;
      let dismissAsNoise = false;
      let stopDetect: DetectVisitResult | null = null;
      if (open.kind === "drive") {
        const cls = classifyDrive({ distanceMeters, durationSeconds });
        isLikelyNoise = cls !== "ok";
        dismissAsNoise = cls === "noise";
        driveDismissedAsNoise = dismissAsNoise;
      } else if (open.kind === "stop") {
        // Visit match first so a scheduled arrival keeps a short stop.
        stopDetect = await detectVisitCandidate(
          client,
          accountId,
          open,
          mut.closeOpen.endedAt,
          data.person ?? data.device_id ?? null,
        );
        arrivalPrompt = stopDetect.arrivalPrompt;
        const cls = classifyStop({
          durationSeconds,
          hasScheduledVisit: stopDetect.hasScheduledVisit,
        });
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
      if (dismissAsNoise && open.kind === "stop") {
        await client.query(
          `UPDATE visit_candidates
           SET status = 'ignored', classification = 'ignore', updated_at = now()
           WHERE account_id = $1
             AND location_segment_id = $2
             AND status = 'pending'
             AND visit_id IS NULL`,
          [accountId, open.id],
        );
      }
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
    // Blip coalescing (TASK-147): if the drive we just closed was a sub-minute
    // noise blip and the reducer wants to open a stop at the same place as the
    // stop that preceded the drive, the dwell never really ended. Reopen the
    // prior stop instead of leaving a duplicate second stop (+ dead drive) that
    // would surface as its own end-of-day interview card. The prior stop's
    // ended_at equals this drive's start (the reducer closed it there).
    let coalescedPriorStopId: string | null = null;
    if (driveDismissedAsNoise && open?.kind === "drive" && mut.open?.kind === "stop") {
      const { rows: prior } = await client.query<{
        id: string;
        zone: string | null;
        latitude: number | null;
        longitude: number | null;
      }>(
        // Candidate prior stop: the one the noise drive closed (its ended_at
        // equals the drive's start). Place-match is advisory; the reopen below
        // re-asserts eligibility atomically.
        `SELECT id, zone, latitude, longitude
           FROM location_segments
          WHERE account_id = $1 AND kind = 'stop' AND ended_at = $2::timestamptz
          ORDER BY started_at DESC
          LIMIT 1`,
        [accountId, open.startedAt],
      );
      const p = prior[0];
      if (
        p &&
        stopsAreSamePlace(p, {
          zone: mut.open.zone,
          latitude: mut.open.latitude,
          longitude: mut.open.longitude,
        })
      ) {
        // Reopen as 'provisional' (the un-dismissed active state — the status
        // CHECK in migration 114 allows only provisional/confirmed/dismissed).
        // The eligibility predicate is in the WHERE (not just the SELECT above)
        // and gated by RETURNING, so a review that committed since the SELECT
        // wins the race and is never clobbered. We only coalesce a stop the
        // system still owns: unreviewed provisional, or auto-noise-dismissed.
        const { rows: reopened } = await client.query<{ id: string }>(
          `UPDATE location_segments
              SET ended_at = NULL,
                  is_likely_noise = false,
                  status = 'provisional',
                  zone = COALESCE(zone, $4),
                  -- Day Review reads place_label before zone: when the prior
                  -- stop was unzoned, prefer the returning event's (often
                  -- recognized) label so a stale drive-time geocode is replaced.
                  place_label = CASE WHEN zone IS NULL THEN COALESCE($5, place_label)
                                     ELSE COALESCE(place_label, $5) END,
                  latitude = COALESCE(latitude, $6),
                  longitude = COALESCE(longitude, $7),
                  suggested_activity_type = COALESCE(suggested_activity_type, $8),
                  updated_at = now()
            WHERE id = $1 AND account_id = $2 AND ended_at = $3::timestamptz
              AND (status = 'provisional'
                   OR (status = 'dismissed' AND COALESCE(is_likely_noise, false) = true))
          RETURNING id`,
          [
            p.id,
            accountId,
            open.startedAt,
            mut.open.zone,
            mut.open.placeLabel,
            mut.open.latitude,
            mut.open.longitude,
            mut.open.suggestedActivityType,
          ],
        );
        // Only coalesce if the reopen actually matched an eligible stop. We do
        // NOT delete the prior stop's pending visit_candidate: that would strand
        // an arrival push already sent for it (and re-create a new one → double
        // prompt). Instead the eventual real close refreshes that candidate's
        // interval in place via ON CONFLICT DO UPDATE (see detectVisitCandidate).
        if (reopened[0]) {
          coalescedPriorStopId = reopened[0].id;
          segmentId = reopened[0].id;
        }
      }
    }

    if (mut.open && !coalescedPriorStopId) {
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

    // TASK-149: ignition off is the arrival signal. Don't wait 5 minutes of
    // GPS still — match the open/just-opened stop to a job and push confirm.
    if (data.kind === "vehicle_disconnect" && !arrivalPrompt) {
      const parkId = segmentId;
      const parkStarted =
        mut.open?.kind === "stop"
          ? mut.open.startedAt
          : open?.kind === "stop"
            ? open.startedAt
            : null;
      const parkLat =
        mut.open?.latitude ?? open?.latitude ?? data.latitude ?? null;
      const parkLng =
        mut.open?.longitude ?? open?.longitude ?? data.longitude ?? null;
      if (parkId && parkStarted && (parkLat != null || parkLng != null)) {
        const parkDetect = await detectVisitCandidate(
          client,
          accountId,
          { id: parkId, startedAt: parkStarted, latitude: parkLat, longitude: parkLng },
          occurredAt,
          data.person ?? data.device_id ?? null,
          { parkedArrival: true },
        );
        arrivalPrompt = parkDetect.arrivalPrompt;
      }
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
    ...(arrivalPrompt ? { arrival_prompt: arrivalPrompt } : {}),
  });
}

type ArrivalPromptPayload = {
  candidate_id: string;
  property_label: string | null;
  wo_title: string | null;
  wo_resolution: string;
  deep_link: string;
  confidence: number;
};

type DetectVisitResult = {
  arrivalPrompt: ArrivalPromptPayload | null;
  hasScheduledVisit: boolean;
};

interface ClosedStop {
  id: string;
  startedAt: string;
  latitude: number | null;
  longitude: number | null;
}

interface CandidateRow {
  property_id: string;
  client_id: string;
  latitude: number | null;
  longitude: number | null;
  today_visit_id: string | null;
  today_job_id: string | null;
  open_job_id: string | null;
  recent_client: boolean;
  job_count: string;
}

/**
 * Score a closed stop against the account's properties and persist the top
 * match (>= confidence floor) as a pending visit_candidate. Runs in the same
 * transaction as the segment close. Schedule/open-job signals work without
 * coordinates; distance is added once a property has learned coords.
 */
async function detectVisitCandidate(
  client: PoolClient,
  accountId: string,
  stop: ClosedStop,
  endedAt: string,
  personOrDevice: string | null = null,
  opts: { parkedArrival?: boolean } = {},
): Promise<DetectVisitResult> {
  const none: DetectVisitResult = { arrivalPrompt: null, hasScheduledVisit: false };
  const durationMinutes = (new Date(endedAt).getTime() - new Date(stop.startedAt).getTime()) / 60000;

  const { rows } = await client.query<CandidateRow & { today_visit_type: string | null; today_assigned: string | null }>(
    `SELECT p.id AS property_id, p.client_id, p.latitude, p.longitude,
            tv.visit_id AS today_visit_id, tv.job_id AS today_job_id,
            tv.visit_type AS today_visit_type, tv.assigned_user_id AS today_assigned,
            oj.id AS open_job_id,
            EXISTS (SELECT 1 FROM jobs j WHERE j.client_id = p.client_id
                      AND j.created_at >= now() - interval '30 days') AS recent_client,
            (SELECT count(*) FROM jobs j WHERE j.client_id = p.client_id) AS job_count
     FROM properties p
     LEFT JOIN LATERAL (
       -- Match any non-cancelled visit for the local business day, including
       -- in_progress/completed so multi-stop days keep attaching time.
       SELECT v.id AS visit_id, v.job_id, v.visit_type, v.assigned_user_id
       FROM visits v JOIN jobs j ON j.id = v.job_id
       WHERE j.property_id = p.id AND v.status <> 'cancelled'
         AND (v.scheduled_start AT TIME ZONE 'America/New_York')::date
             = ($2::timestamptz AT TIME ZONE 'America/New_York')::date
       ORDER BY
         CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END,
         v.scheduled_start ASC
       LIMIT 1
     ) tv ON true
     LEFT JOIN LATERAL (
       -- Open work only. Completed-in-14-days used to steal today's job_id
       -- (TASK-148): the house can still match via coords; night interview
       -- asks work-on-this vs new work. Invoiced stays excluded (Floss).
       SELECT j.id FROM jobs j
       WHERE j.property_id = p.id
         AND j.status IN ('scheduled','in_progress')
       ORDER BY j.scheduled_start ASC NULLS LAST
       LIMIT 1
     ) oj ON true
     WHERE p.account_id = $1
       AND (p.latitude IS NOT NULL OR tv.visit_id IS NOT NULL OR oj.id IS NOT NULL)`,
    [accountId, stop.startedAt],
  );
  if (rows.length === 0) return none;

  const ranked = rankVisitCandidates({
    stop: { latitude: stop.latitude, longitude: stop.longitude, durationMinutes },
    candidates: rows.map((r) => ({
      propertyId: r.property_id,
      clientId: r.client_id,
      latitude: r.latitude,
      longitude: r.longitude,
      scheduledToday: r.today_visit_id != null,
      openJob: r.open_job_id != null,
      jobId: r.open_job_id ?? null,
      visitId: r.today_visit_id ?? null,
      recentClient: r.recent_client,
      repeatClient: Number(r.job_count) > 1,
    })),
  });

  const top = ranked[0];
  // TASK-079 / TASK-106: dwell floor — a sub-5-min stop with no scheduled
  // visit is jitter, not a visit. Keeps day-review from filling with flicker.
  if (
    !top ||
    !shouldCreateVisitCandidate({
      score: top.score,
      durationMinutes,
      hasScheduledVisit: top.visitId != null,
      distanceMeters: top.distanceMeters,
      parkedArrival: opts.parkedArrival === true,
    })
  ) {
    return none;
  }

  const openWos = await listOpenWorkOrdersAtProperty(
    client,
    accountId,
    top.propertyId,
    stop.startedAt,
  );
  const resolution = resolveWorkOrderForProperty({
    openWorkOrders: openWos,
    overrideWorkOrderId: null,
  });

  // Close-path live prompt uses the 150ft near band. Park (Bluetooth
  // disconnect) uses the 250ft far band — same cap as auto-detect / hold.
  const provenMeters = (opts.parkedArrival ? 250 : 150) * 0.3048;
  const distanceProven =
    top.distanceMeters != null && top.distanceMeters <= provenMeters;

  // Prefer assignment from the resolved work order so job/visit/WO stay consistent.
  let jobIdForInsert = top.jobId;
  let visitIdForInsert = resolution.visitId ?? top.visitId;
  if (resolution.workOrderId) {
    const { rows: woRows } = await client.query<{ job_id: string }>(
      `SELECT job_id FROM work_orders WHERE id = $1 AND account_id = $2`,
      [resolution.workOrderId, accountId],
    );
    if (woRows[0]) jobIdForInsert = woRows[0].job_id;
    visitIdForInsert = resolution.visitId ?? null;
    // If resolution has no visit, keep top.visitId only when it is on the same WO/job.
    if (!visitIdForInsert && top.visitId) {
      const { rows: vRows } = await client.query<{ work_order_id: string | null; job_id: string }>(
        `SELECT work_order_id, job_id FROM visits WHERE id = $1 AND account_id = $2`,
        [top.visitId, accountId],
      );
      const v = vRows[0];
      if (
        v &&
        (v.work_order_id === resolution.workOrderId || v.job_id === jobIdForInsert)
      ) {
        visitIdForInsert = top.visitId;
      }
    }
  }

  // Resolve tech before workday gate (multi-user: only that user's open day counts).
  const matchRowForUser = visitIdForInsert
    ? rows.find((r) => r.today_visit_id === visitIdForInsert)
    : null;
  const mappedUserId = resolveLocationPersonUserId(
    personOrDevice,
    loadLocationPersonMap(),
  );
  const stampUserId = mappedUserId ?? matchRowForUser?.today_assigned ?? null;

  let workdayOpen = false;
  if (stampUserId) {
    const { rows: bd } = await client.query<{ id: string }>(
      `SELECT id FROM business_days
       WHERE account_id = $1 AND user_id = $2 AND closed_at IS NULL
         AND business_date = ($3::timestamptz AT TIME ZONE 'America/New_York')::date
       LIMIT 1`,
      [accountId, stampUserId, stop.startedAt],
    );
    workdayOpen = bd.length > 0;
  } else {
    // Live prompt / candidate without a resolved tech: any open day (solo path).
    const { rows: bd } = await client.query<{ id: string }>(
      `SELECT id FROM business_days
       WHERE account_id = $1 AND closed_at IS NULL
         AND business_date = ($2::timestamptz AT TIME ZONE 'America/New_York')::date
       LIMIT 1`,
      [accountId, stop.startedAt],
    );
    workdayOpen = bd.length > 0;
  }

  const liveEligible = isLivePromptEligible({
    workdayOpen,
    confidenceScore: top.score,
    distanceProven,
    scheduledToday: top.visitId != null,
    openJob: jobIdForInsert != null,
    alreadyPrompted: false,
    status: "pending",
  });

  const { rows: inserted } = await client.query<{ id: string; was_inserted: boolean }>(
    // Blip coalescing (TASK-147) can re-close a stop whose candidate already
    // exists. Refresh the interval in place for a still-pending candidate (so the
    // full-dwell departure/duration is recorded and a scheduled match is not lost
    // to a frozen row) — but xmax=0 distinguishes a genuine INSERT from that
    // refresh so the arrival push below fires exactly once. Reviewed candidates
    // (status <> 'pending') are left untouched (the WHERE skips them).
    `INSERT INTO visit_candidates
       (account_id, location_segment_id, property_id, matched_client_id, job_id, visit_id,
        work_order_id, wo_resolution, live_eligible,
        distance_meters, confidence_score, arrival_time, departure_time, duration_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (location_segment_id) DO UPDATE
       SET departure_time = EXCLUDED.departure_time,
           duration_minutes = EXCLUDED.duration_minutes,
           distance_meters = EXCLUDED.distance_meters
       WHERE visit_candidates.status = 'pending'
     RETURNING id, (xmax::text::bigint = 0) AS was_inserted`,
    [
      accountId,
      stop.id,
      top.propertyId,
      top.clientId,
      jobIdForInsert,
      visitIdForInsert,
      resolution.workOrderId,
      resolution.status,
      liveEligible,
      top.distanceMeters,
      top.score,
      stop.startedAt,
      endedAt,
      Math.round(durationMinutes),
    ],
  );
  // Reconcile a candidate the owner CONFIRMED during a reopened (coalesced)
  // dwell: the confirm stamped its interval — and the billable activity it
  // created — at the blip-truncated first close. The pending-only upsert above
  // skips a confirmed row, so extend both here to the real departure. No-op
  // unless a confirmed candidate exists for this segment (only on a coalesced
  // re-close). RETURNING gates the activity extend + the keep signal.
  const { rows: reconciled } = await client.query<{
    id: string;
    visit_id: string | null;
    classification: string | null;
  }>(
    `UPDATE visit_candidates
        SET departure_time = $3::timestamptz, duration_minutes = $4
      WHERE account_id = $1 AND location_segment_id = $2
        AND status = 'confirmed' AND departure_time < $3::timestamptz
    RETURNING id, visit_id, classification`,
    [accountId, stop.id, endedAt, Math.round(durationMinutes)],
  );
  if (reconciled[0]) {
    // Ingest cannot 409 + proposeRebalance (that's the interactive confirm
    // route). Cap ended_at at the next later activity start so a switch or
    // log during the reopened dwell is never double-counted.
    const { rows: extended } = await client.query<{ user_id: string }>(
      `UPDATE activity_entries a
          SET ended_at = LEAST(
                $3::timestamptz,
                COALESCE(
                  (
                    SELECT MIN(b.started_at)
                    FROM activity_entries b
                    WHERE b.account_id = a.account_id
                      AND b.user_id = a.user_id
                      AND b.voided_at IS NULL
                      AND b.id <> a.id
                      AND b.started_at > a.started_at
                      AND b.started_at < $3::timestamptz
                  ),
                  $3::timestamptz
                )
              )
         FROM visit_candidates vc
        WHERE vc.account_id = $1 AND vc.location_segment_id = $2
          AND vc.status = 'confirmed' AND vc.activity_entry_id = a.id
          AND a.account_id = $1 AND a.ended_at < $3::timestamptz
      RETURNING a.user_id`,
      [accountId, stop.id, endedAt],
    );
    const linkedVisitId = reconciled[0].visit_id;
    const restampUserId = stampUserId ?? extended[0]?.user_id ?? null;
    if (linkedVisitId && restampUserId) {
      // Human already confirmed this candidate; re-apply GPS presence with
      // the full dwell so a visit left in_progress (short first close) can
      // complete, and an already-completed visit gets the later completed_at.
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
        restampUserId,
      ]);
      await applyGpsPresenceToVisit(client, {
        accountId,
        userId: restampUserId,
        visitId: linkedVisitId,
        arrivalTime: stop.startedAt,
        departureTime: endedAt,
        complete: shouldCompleteVisitFromPresence({
          classification: reconciled[0].classification ?? "",
          durationMinutes: Math.round(durationMinutes),
        }),
      });
    }
    // An already-confirmed stop must never be dismissed by the dwell floor:
    // signal "keep" so classifyStop treats the reopened close as a real stay.
    return { arrivalPrompt: null, hasScheduledVisit: true };
  }
  const candidateId = inserted[0]?.id;
  if (!candidateId) return none;
  const wasInserted = inserted[0]?.was_inserted === true;
  const hasScheduledVisit = visitIdForInsert != null;
  // A refresh (coalesced re-close) of an existing candidate: the interval is now
  // corrected and hasScheduledVisit is reported, but the arrival prompt already
  // fired on the first close — do not push again.
  if (!wasInserted) return { arrivalPrompt: null, hasScheduledVisit };

  // Presence-only on scheduled visit: high-trust bar only (E4 harden). Never
  // owner-fallback; person map or assigned tech required.
  if (visitIdForInsert && stampUserId) {
    const mayStamp = shouldAutoStampPresence({
      workdayOpen,
      confidenceScore: top.score,
      distanceProven,
      scheduledToday: top.visitId != null,
      hasUserId: true,
    });
    if (mayStamp) {
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true)`,
        [stampUserId],
      );
      await autoRecordScheduledVisitPresence(client, {
        accountId,
        userId: stampUserId,
        candidateId,
        visitId: visitIdForInsert,
        jobId: jobIdForInsert,
        arrivalTime: stop.startedAt,
        departureTime: endedAt,
        durationMinutes: Math.round(durationMinutes),
        visitType: matchRowForUser?.today_visit_type ?? null,
      });
    }
  }

  if (!liveEligible) return { arrivalPrompt: null, hasScheduledVisit };

  const woTitle =
    resolution.options.find((o) => o.id === resolution.workOrderId)?.title ?? null;
  const { rows: propRows } = await client.query<{ address: string | null; client_name: string | null }>(
    `SELECT p.address, c.name AS client_name
     FROM properties p
     LEFT JOIN clients c ON c.id = p.client_id
     WHERE p.id = $1 AND p.account_id = $2`,
    [top.propertyId, accountId],
  );
  const propertyLabel = propRows[0]?.address ?? propRows[0]?.client_name ?? null;

  // Native Web Push mirror of the arrival prompt (TASK-118). Fresh candidate =
  // first prompt, so this fires once. To the resolved tech; owners on the solo
  // path. Fire-and-forget on its own connection; never throws.
  const arrivalBody = propertyLabel
    ? `Arrived at ${propertyLabel}${woTitle ? ` · ${woTitle}` : ""}`
    : "Confirm your arrival at the job.";
  const arrivalPush = {
    title: "You're on site",
    body: arrivalBody,
    url: `/app/my-work?proposal=${candidateId}`,
    tag: `arrival-${candidateId}`,
  };
  if (stampUserId) await sendPushToUser(accountId, stampUserId, arrivalPush);
  else await sendPushToOwners(accountId, arrivalPush);

  await stampLivePromptedAt(client, candidateId, accountId);

  return {
    arrivalPrompt: {
      candidate_id: candidateId,
      property_label: propertyLabel,
      wo_title: woTitle,
      wo_resolution: resolution.status,
      deep_link: `/app/my-work?proposal=${candidateId}`,
      confidence: top.score,
    },
    hasScheduledVisit,
  };
}
