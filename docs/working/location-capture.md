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

`GET /api/v1/activities/segments` (authenticated owner session) → today's
stop/drive segments oldest-first plus the open one. Dismissed segments hidden.

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

## HA-side setup (later slice)

To be documented with the HA automation: enable the Companion app's background
location + detected-activity + reverse-geocoded-location sensors; define zones
for home + frequent supply houses; publish zone enter/leave + activity changes to
the bridge. Zones are optional — background GPS + detected-activity already
captures arbitrary customer stops; zones just make recurring places self-label.
