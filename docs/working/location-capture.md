# Location Capture — ingest contract (TASK-024)

Passive, location-based activity capture. The installed PWA cannot do background
geolocation, so location transitions are fed in from the **Home Assistant
Companion app** (native background location) via an authenticated ingest
endpoint. Events are reduced into **stop / drive segments** that the owner labels
into the activity ledger later. Segments are provisional and never touch
`activity_entries` / profitability until labelled.

This document is the **ingest contract**. The HA-side automation and the
label-it timeline UI are tracked as later slices of TASK-024.

## Pipeline

```
HA Companion app (zones + background GPS + detected-activity)
  → HA automation → n8n / MQTT bridge (reuses the SMS-intake transport)
    → POST /api/internal/location  (x-api-key: $LOCATION_INTERNAL_KEY)
      → location_events (raw, append-only)
      → reducer → location_segments (stop/drive, provisional)
        → [later] owner labels a segment → activity_entries row
```

## Endpoint

`POST /api/internal/location`

- Auth: header `x-api-key: <LOCATION_INTERNAL_KEY>` (set in the FSM env; see
  `infra/garonhome.env.example`). 401 on mismatch.
- Body (JSON):

  | field | type | notes |
  | --- | --- | --- |
  | `kind` | enum | `zone_enter` \| `zone_leave` \| `location_update` \| `activity_change` |
  | `occurred_at` | ISO-8601 | optional; defaults to server now |
  | `zone` | string | HA zone name for `zone_*` events (e.g. `home`, `Ferguson`) |
  | `latitude` / `longitude` | number | optional |
  | `geocoded_address` | string | optional; reverse-geocoded address of a stop |
  | `detected_activity` | enum | `still` \| `walking` \| `running` \| `in_vehicle` \| `cycling` \| `unknown` |
  | `external_id` | string | optional idempotency key (HA retries are de-duped) |

- Response: `{ ok, current_segment_id, opened, closed }` (or `{ duplicate: true }`).

### Example payloads

```jsonc
// Left home → start of a drive
{ "kind": "zone_leave", "zone": "home", "occurred_at": "2026-06-19T08:00:00Z", "external_id": "ha-1029" }

// Arrived at the supply house → a stop (auto-suggests material_run)
{ "kind": "zone_enter", "zone": "Ferguson", "occurred_at": "2026-06-19T08:20:00Z", "external_id": "ha-1030" }

// Stopped moving at a customer with no zone → a stop (owner labels it)
{ "kind": "activity_change", "detected_activity": "still",
  "geocoded_address": "14 Oak St", "latitude": 42.1, "longitude": -71.2,
  "occurred_at": "2026-06-19T09:05:00Z", "external_id": "ha-1041" }
```

## Reading segments

`GET /api/v1/activities/segments[?date=YYYY-MM-DD]` (authenticated owner session)
→ that day's stop/drive segments oldest-first plus the open one (defaults to
today). Dismissed segments hidden.

## Labelling segments → the ledger (slice 2)

`PATCH /api/v1/activities/segments/{id}`:

- `{ "action": "confirm", "activity_type": "material_run", "entity_type"?, "entity_id"?, "note"? }`
  → inserts an `activity_entries` row (`source = 'backfill'`) spanning the
  segment's start/end, links it back (`status = 'confirmed'`,
  `activity_entry_id`). Idempotent; rejects a still-open segment with 409 so it
  never collides with the live "one active entry" invariant.
- `{ "action": "dismiss" }` → hides the segment; nothing reaches the ledger.

UI: the **Captured locations** panel on `/app/timeline` (and its day picker)
lists provisional segments with a one-tap activity assignment + Confirm/Dismiss,
and shows confirmed ones as logged. Provisional segments never affect
profitability until confirmed.

## Drive → mileage (TASK-025 slice 1)

A **drive** segment can be logged as a mileage session instead of an activity:

`PATCH /api/v1/activities/segments/{id}` with
`{ "action": "log_trip", "vehicle_id": "...", "miles": 12.4, "note"? }` →
inserts a `vehicle_sessions` row (miles-only; no odometer needed), links it back
(`vehicle_session_id`, `status = 'confirmed'`), and attributes the drive to that
vehicle. Idempotent; rejects non-drive / still-open segments.

Distance is estimated from GPS: when a drive closes, the ingest stores a
straight-line `distance_meters` (great-circle from the drive's start point to
where it ended), surfaced as `estimated_miles`. It's an **estimate the owner
confirms/edits** before it writes. In the panel, drive rows show a **vehicle
picker** (defaults to the vehicle flagged `is_default`) + the **editable miles**
(pre-filled from the estimate) + **Log trip**.

Migration 115 adds `location_segments.{distance_meters, vehicle_id,
vehicle_session_id}` and `vehicles.{bluetooth_id, is_default}`. Geo helpers:
`packages/domain/src/geo.ts`.

Slice 2 (next): Bluetooth-triggered, vehicle-aware capture — connecting the phone
to a known vehicle's stereo (RAM "Uconnect" / GMC "IntelliLink") auto-opens a
vehicle-tagged drive and pre-selects the vehicle; periodic GPS during drives
sharpens the distance estimate.

## Segmentation rules (reducer)

Pure, unit-tested in `apps/web/lib/location/segments.test.ts`. At most one open
segment at a time:

- `zone_enter` → close any open, open a **stop** (label = zone). Same-zone re-entry is a no-op.
- `zone_leave` → close the open stop, open a **drive**. No-op if already driving.
- `activity_change`:
  - `in_vehicle` → ensure a **drive** is open.
  - `still` → close an open drive, open a **stop** here (address fills in via `location_update`).
  - other → no transition.
- `location_update` → enrich an open stop that is missing its address/coords.

Activity suggestion: drives → `travel`; stops at a recognized supply-house zone →
`material_run`; everything else → none (the owner assigns it, e.g. `job_work` at
a customer address). Zone→activity rules live in `packages/domain/src/location.ts`.

## HA-side setup (slice 3)

The HA wiring is a direct `rest_command` → FSM ingest (no n8n hop needed; the
endpoint is idempotent). Canonical config: **`ha-location-capture.yaml`** in this
folder. On the garonhome box it is installed across the HA include files
(`rest_commands.yaml`, `automations.yaml`) + `secrets.yaml`, and routes over the
LAN via NPM (`http://fsm.garonhome.local`).

Entities used (Nick's Samsung S25 Ultra):
- `device_tracker.nick_s_s25` — zone presence (zone enter/leave).
- `sensor.nick_s_s25_ultra_detected_activity` — `in_vehicle` / `still` transitions.
- `sensor.nick_s_s25_ultra_geocoded_location` — reverse-geocoded stop address.

Two automations are installed: **zone transition** (enter/leave) and **detected
activity change** (filtered to `in_vehicle`/`still`). A geocode-update automation
is provided commented-out for optional address enrichment.

One-time phone setup (Android Companion app): enable the **Background location**,
**Detected activity**, and **Geocoded location** sensors and grant "Always"
location permission. Add an HA **zone** for each regular supply house (Home
already exists). Zones are optional — the activity-change feed captures arbitrary
customer stops too; zones just make recurring places self-label.

After editing the HA YAML, reload via Developer Tools → YAML → "REST Commands"
and "Automations" (no full restart needed).

> **Live requirement:** the `/api/internal/location` route ships in the FSM app
> build, so the app must be deployed from `main` (slices 1–2) for the endpoint to
> exist. The shared secret is `LOCATION_INTERNAL_KEY` in the FSM env, mirrored as
> `fsm_location_internal_key` in HA `secrets.yaml`.
