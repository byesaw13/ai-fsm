# TASK-024: Passive location-based activity capture (HA-fed time ledger)

Status:
Done

Phase:
1

Problem:
The owner forgets to switch activity state during the day — Start Day, working a
job, a material run to the supply house, travel. The time ledger
(`activity_entries`, migration 111) ends up with gaps that have to be
reconstructed from end-of-day memory, so `job_work` / `travel` / `material_run`
times are inaccurate. The owner wants transitions captured automatically as facts
he can label later, not an exact-activity guesser.

Business Value:
- Accurate time logging without relying on memory → trustworthy job
  profitability, tax mileage, and vehicle-cost rollups.
- Turns the day into a reviewable timeline of stop/drive segments to confirm,
  instead of blank time that must be remembered.

Platform constraint (why this is not a PWA feature):
The installed PWA **cannot** do background geolocation — browsers suspend a web
app's location watcher the moment the screen locks, and the browser Geofencing
API was removed. Google Maps Timeline does the right segmentation but exposes no
API and moved on-device (manual Takeout export only), so it is not a usable feed.
The capture source must be something with real native background location that we
can read from. The homelab already runs **Home Assistant**, whose Companion app
has exactly that.

Approach:
Use the HA Companion app as the native background location source, bridged into
FSM via the existing SMS-intake transport (n8n / MQTT / ntfy — see the SMS intake
pipeline). Two complementary streams:
- **Zones (optional)** for recurring places (home + frequent supply houses):
  clean, low-battery enter/leave events that self-label (`material_run`,
  `travel`).
- **Background GPS + detected-activity (`still`/`in_vehicle`) + reverse-geocoded
  address** for everything else: captures arbitrary customer stops with no
  pre-listing. Zones are additive labels, not a requirement.
HA automation publishes transition events to an authenticated FSM ingest
endpoint, which writes **provisional** `activity_entries` rows (`source=auto_*` /
`backfill`, `ended_at` open until the next transition). The owner labels/confirms
or voids each segment later — the table's void+re-add model already supports this.

Scope:
- Authenticated ingest endpoint (internal key, like `SMS_INTERNAL_KEY`) accepting
  `{ timestamp, lat/long or zone, detected_activity, geocoded_address }`.
- Segment logic: cluster points → "stop" (stationary > N min at an address) vs
  "drive" (`in_vehicle`); open/close `activity_entries` on transitions.
- Map known zones → default `activity_type` (home / supply-house → `material_run`
  or `travel`).
- Day-timeline UI: show provisional segments; one-tap assign
  job/visit/`activity_type`; confirm or void. Provisional entries visually
  distinct and excluded from profitability until confirmed.
- HA-side docs in `docs/working`: Companion app config (background location,
  detected-activity + geocoded-location sensors), zone setup for home + supply
  houses, and the publish automation.

Out of Scope (v1):
- Native app wrapper (Capacitor + background-geolocation) for first-party
  geofencing — a separate future task only if HA proves insufficient for customer
  addresses.
- Multi-employee location tracking (single-owner first).
- Silent/unconfirmed job attribution — provisional entries always require owner
  confirmation; no guessing what the work was.
- Real-time push reminders (can layer later).

Acceptance Criteria:
- [x] Leaving/arriving a place produces a provisional `activity_entries` row with
      no manual action, visible in the day timeline.
- [x] Known zones (home + ≥1 supply house) self-label correctly.
- [x] Unknown/customer stops appear as geocoded segments labelable in ≤1 tap.
- [x] Provisional entries are visually distinct and never affect profitability
      until confirmed.
- [x] HA Companion config + battery impact documented in `docs/working`.
- [x] Ingest auth via env key (no secrets in repo); segment/ingest logic tested.

Dependencies / Notes:
- Builds on `activity_entries` (111), vehicle sessions (083/109/113), mileage
  logs (008/082).
- Reuses the SMS-intake transport (n8n / MQTT / ntfy).
- Privacy: the owner's own location; store segment endpoints + address, not a
  continuous breadcrumb trail, unless a need emerges.

Notes:
Archived during north-star reconciliation (2026-07-03). Shipped in
`db/migrations/114_location_capture.sql`, `apps/web/app/api/internal/location/route.ts`,
and `docs/working/location-capture.md`.