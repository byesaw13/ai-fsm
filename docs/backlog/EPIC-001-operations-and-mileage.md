# EPIC-001: Operations & Mileage

The daily operating loop for Dovetails: starting the day, tracking which vehicle
is in use and its odometer, recording where time goes, and keeping that data
trustworthy enough to feed tax mileage, vehicle cost, and job profitability.

## Active tasks

# TASK-027: Hybrid tracking — manual mileage, auto time

Status:
In Progress

Problem:
The old manual flow (Start Day → vehicle session + tapping activity chips) and
the new auto location capture both record the same hours, so they collide: a
manual `travel` entry overlaps the auto drive/stop segments, and the overlap
guard then blocks confirming the auto data ("conflicts with time already
marked"). GPS also can't match the odometer for mileage accuracy.

Decision (owner, 2026-06-20):
**Hybrid — manual mileage, auto time.** Keep Start Day's odometer session as the
mileage record (odometer accuracy); let auto-capture own activities/time. Interim
"until tracking is close to flawless."

Approach (this pass):
- Auto **drives confirm as a `travel` activity** (time), same as stops — not as
  GPS mileage. The drive→mileage "Log trip" UI is removed from the segments panel
  (the `log_trip` API stays for later); mileage comes from Start Day's odometer.
- Guidance: don't tap the NowBar activity chips when auto-capture is on — let the
  timeline fill and confirm there, so nothing overlaps.

Out of Scope (this pass / follow-ups):
- Overlap *resolution* (offer to replace an overlapping manual entry instead of a
  hard block) — a follow-up if collisions still happen.
- Suppressing/hiding the NowBar activity chips during an auto-captured day.
- Trusting GPS mileage (revisit when tracking is tighter).

Acceptance Criteria:
- [ ] An auto drive can be confirmed as a `travel` activity in one tap.
- [ ] Start Day mileage and auto activities no longer double-count the same time
      when the owner stops manually tapping activities.

Test gap (documented):
This pass is a UI-wiring change — the segments panel now invokes the existing,
already-exercised `confirm` action for drives (same path stops use) instead of
`log_trip`. No new business logic: the segmentation reducer is unit-tested
(`segments.test.ts`) and the `confirm` endpoint/overlap guard are unchanged and
covered by integration/e2e. The web app has no React-component test harness
(`@testing-library/react` is not a dependency), so a focused panel unit test is
not added here; standing up RTL is out of scope for this fix.

# TASK-026: Day Map (stops + drive routes)

Status:
In Progress

Problem:
The captured day is a list. Stops and drives carry GPS, but the owner can't see
*where* they were — which makes labeling slower and gives no visual check on the
auto-mileage.

Approach:
A map on the activity timeline (`/app/timeline`) that plots the day:
- **stops as pins**, **drives as routes** drawn from the `location_events` GPS
  breadcrumb (denser thanks to the drive-GPS-point automation).
- Provisional vs confirmed are color-coded; popups show the place / trip miles.
- Tiles: **Leaflet + OpenStreetMap** — free, no API key (aligns with the cost /
  complexity policy). Loaded client-side only (`ssr: false`).

Scope:
- `GET /api/v1/activities/segments/geometry[?date=]` — stop pins + drive routes
  for a day.
- `DayMap` (imperative Leaflet client component) + `DayMapPanel` (dynamic, ssr
  off) mounted on the timeline above the Captured Locations panel.
- `leaflet` + `@types/leaflet` dependency.

Out of Scope:
- Geocoding client/property addresses onto the map (separate, needs geocoding).
- Live "where am I now" tracking; offline tiles.

Acceptance Criteria:
- [ ] The timeline shows a map of the selected day's stops + drive routes.
- [ ] Provisional/confirmed are visually distinguishable; popups identify each.
- [ ] Empty days show a clear "nothing mapped yet" state.
- [ ] No API key / external billing (OSM tiles).

Notes:
- Route quality tracks the breadcrumb density (sparse on older drives, real on
  new ones via the periodic-GPS automation). Builds on TASK-024/025.

# TASK-025: Bluetooth-triggered, vehicle-aware auto-mileage

Status:
Backlog (not started)

Problem:
Mileage is still entered by hand (start/end odometer per vehicle session). The
owner wants trips logged automatically and attributed to the right vehicle,
without thinking about it. No vehicle telematics are available (the RAM has no
usable HA integration), but the phone's Bluetooth tells us which vehicle he is
in and exactly when the engine is on.

Business Value:
- Hands-off mileage capture per vehicle → trustworthy tax mileage and vehicle
  cost without manual odometer entry.
- Precise trip boundaries (ignition on/off) instead of guessed-from-motion.

Approach:
Extend TASK-024. The HA Companion app's `sensor.<phone>_bluetooth_connection`
identifies the connected car stereo. An HA automation maps a known vehicle BT
identity → a vehicle and posts to the FSM ingest:
- **connect** to a known vehicle BT → open a drive segment tied to that vehicle.
- **disconnect** → close the drive; compute distance from the drive segment's GPS
  and surface an **estimated trip mileage the owner confirms** (not auto-written —
  GPS distance is an estimate) before it writes to that vehicle's
  `vehicle_sessions` / `mileage_logs`.

Vehicle BT map (see also the agent memory note):
- RAM 2019 (plate DOVETLS, work truck) → "Uconnect" / `00:22:A0:A6:49:0D`
- GMC Acadia 2018 → "GMC INTELLILINK" / `30:C3:D9:19:1E:C3`
Decision: **both** vehicles auto-track, each attributed to its own record; miles
are **owner-confirmed**, not auto-written.

Scope:
- Vehicle BT identity → `vehicles` row mapping (config; both vehicles).
- Ingest: accept a vehicle identifier + a Bluetooth connect/disconnect signal;
  associate the resulting drive segment with the vehicle. Likely a small additive
  migration (vehicle reference on `location_segments`) + a new event kind.
- Distance: compute trip miles from the drive segment's GPS (route between
  start/end, or accumulate points). Document the estimate accuracy.
- Confirm UI: on the timeline/mileage surface, present the auto-captured trip +
  estimated miles for one-tap confirm (or edit) → writes the vehicle session.
- HA automation watching the bluetooth_connection sensor + runbook.

Out of Scope:
- Auto-writing miles with no confirmation (explicitly rejected).
- Vehicle telematics / OBD / odometer (none available; GPS estimate is the method).
- Multi-driver attribution (single-owner first).

Acceptance Criteria:
- [ ] Connecting the phone to a known vehicle's Bluetooth opens a vehicle-tagged
      drive; disconnecting closes it.
- [ ] The closed trip surfaces estimated miles attributed to the correct vehicle.
- [ ] Owner confirms/edits the miles in one tap → writes a `vehicle_sessions` /
      `mileage_logs` entry; nothing is written without confirmation.
- [ ] GPS-estimate accuracy + method documented.

Prerequisites / Notes:
- Both the RAM and GMC must exist as rows in the FSM `vehicles` table to attach
  sessions (RAM likely already does).
- Confirm what `connected_paired_devices` actually contains once the sensor
  populates (friendly name vs MAC) so the automation matches correctly.
- Builds directly on TASK-024 (`location_segments`, the ingest, the timeline).

# TASK-024: Passive location-based activity capture (HA-fed time ledger)

Status:
Backlog (not started)

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
- [ ] Leaving/arriving a place produces a provisional `activity_entries` row with
      no manual action, visible in the day timeline.
- [ ] Known zones (home + ≥1 supply house) self-label correctly.
- [ ] Unknown/customer stops appear as geocoded segments labelable in ≤1 tap.
- [ ] Provisional entries are visually distinct and never affect profitability
      until confirmed.
- [ ] HA Companion config + battery impact documented in `docs/working`.
- [ ] Ingest auth via env key (no secrets in repo); segment/ingest logic tested.

Dependencies / Notes:
- Builds on `activity_entries` (111), vehicle sessions (083/109/113), mileage
  logs (008/082).
- Reuses the SMS-intake transport (n8n / MQTT / ntfy).
- Privacy: the owner's own location; store segment endpoints + address, not a
  continuous breadcrumb trail, unless a need emerges.

# TASK-023: Daily Command Center UX Modernization

Status:
Completed

Goal:
Redesign the Daily Command Center so it feels like the supplied mockups: clean, mobile-first, visually polished, fast to use, and organized around the technician's real workday.

Scope:
- State-driven dashboard UI (Before Day Starts, Active Day, End of Day).
- Mobile-first responsive layout matching mockup aesthetics.
- Quick activity chips for single-tap switching on the NowBar.
- Inline checklist wizard for End of Day closing.

Out of Scope:
- Business Ledger.
- New database tables.
- Core business logic changes.

Acceptance Criteria:
- [x] Dashboard has a clear state-driven layout.
- [x] Start Day is visually dominant before the day starts.
- [x] Active NowBar is visually dominant during the workday.
- [x] Quick activity chips support one-tap switching.
- [x] End Day checklist is visually dominant when closing the day.
- [x] Mobile layout resembles the clarity and polish of the supplied mockups.
- [x] Desktop layout uses sidebar + clean card grid.
- [x] Existing mileage/session/activity functionality still works.
- [x] No new untracked feature work is introduced.
- [x] pnpm gate:fast passes.

# TASK-035: MCP Write Tools v1 (low-risk operations writes)

Status:
Proposed

Problem:
The MCP server (TASK-033) is read-only. Once it proves useful in daily use, the
highest-value next step is a small set of **low-risk** write tools that support
the Daily Operations Log vision — capturing notes, time, and mileage from an AI
client without opening the app.

Business Value:
- Lets the owner log the day's work conversationally from the field.
- Directly feeds the time ledger and daily operations log that already exist.
- Keeps writes small and reversible so the safety model can be proven on
  low-stakes actions before anything financial.

Scope:
First write tools, each layered on the existing service layer:
- `create_job_note`
- `log_activity_entry`
- `log_mileage`
- `start_day`
- `end_day`

Cross-cutting requirements for every write tool:
- Explicit confirmation flag on the tool input (no silent writes).
- Audit log entry written for each mutation.
- Workflow event emitted where the action has downstream automations.
- Account scoped (and owner/admin gated) exactly as the read tools are.
- Idempotency protection where appropriate (e.g. `start_day` must not create a
  second open day; `log_mileage` should dedupe a repeated submission).
- Writes go through the web app's service layer, not new parallel SQL.

Out of Scope:
- Invoice creation, payment recording, job status editing.
- Any Square / payment-provider action.
- Any Home Assistant action.
- Bulk or destructive operations.

Acceptance Criteria:
- [ ] The five tools above create the correct records, account-scoped.
- [ ] Each write requires an explicit confirmation flag.
- [ ] Each write produces an audit log entry (and workflow event where relevant).
- [ ] Idempotency is enforced where it matters (start/end day, mileage).
- [ ] Unit + integration tests cover happy path, scoping, and idempotency.

Notes:
Originally framed as `EPIC: MCP-WRITE-V1`; recorded here as a single task under
Operations because all five tools are operations-centric. Split into multiple
tasks if the build proves large. Do **not** start until TASK-033 has been in
real daily use and TASK-034 (non-superuser RLS verification) is considered.

## Completed

- [TASK-001: Vehicle Mileage Sessions](done/TASK-001-vehicle-mileage-sessions.md) — Done
- [TASK-002: Vehicle Session Recovery](done/TASK-002-vehicle-session-recovery.md) — Done
- [TASK-003: Wrong Vehicle Correction](done/TASK-003-wrong-vehicle-correction.md) — Done
- [TASK-004: Daily Operations Log](done/TASK-004-daily-operations-log.md) — Done
- [TASK-005: Activity Tracking](done/TASK-005-activity-tracking.md) — Done
- [TASK-019: Activity Timeline Correction](done/TASK-019-activity-timeline-correction.md) — Done
- [TASK-021: Quick Activity Switching](done/TASK-021-quick-activity-switching.md) — Done
- [TASK-022: Smart Start Day](done/TASK-022-smart-start-day.md) — Done
