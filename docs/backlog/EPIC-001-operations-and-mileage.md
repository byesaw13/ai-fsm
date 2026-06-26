# EPIC-001: Operations & Mileage

The daily operating loop for Dovetails: starting the day, tracking which vehicle
is in use and its odometer, recording where time goes, and keeping that data
trustworthy enough to feed tax mileage, vehicle cost, and job profitability.

## Active tasks

> The TASK-049…057 block is the **Operations Engine** program. Canonical design:
> `docs/canonical/OPERATIONS.md`. Build order and rationale: that doc + the
> approved plan. The model treats the app as an Operations Engine (the historical
> ledger is one component), keeps a live Current Operations State, and makes the
> Business Day a pure aggregate. **Freeze gate: do not start TASK-049/050/054/055/
> 057 until TASK-051/052/053/056 (Business Day + Payroll + Activity/State) are
> stable.**

# TASK-059: My Day start-surface consolidation (remove odometer-unlocks-day framing)

Status:
In Progress

Problem:
After the Operations Engine landed, My Day still carried the old framing that
fought the new model: a "Start Your Workday — log starting odometer to unlock day
tracking" hero (the day does NOT start via mileage anymore) and a "Complete &
Close Day" button that faked a close (toast + navigate, no business_days change)
and re-coupled mileage to the day ("close your mileage session before you can
close your day").

Business Value:
The Today header (Clock In / Open Day) is the unambiguous day-start; the rest of
My Day stops contradicting it.

Scope:
- Reframe the start_day hero to a Mileage Session (it lives under the "Start
  Mileage Session" tab), not "your workday"; drop the odometer-unlocks-day copy
  and the hardcoded name.
- Remove the fake, mileage-coupled "Complete & Close Day" button; the real,
  checklist-gated close is the Business Day control in the header. The tab becomes
  end-of-day review only.

Out of Scope:
- A full visual merge of the header + stepper into one block (later if wanted).

Acceptance Criteria:
- [ ] No "unlock day tracking" / "Start Your Workday" framing on the mileage tab.
- [ ] One day-close path (header); closing mileage/timer never closes the day.

Notes:
Follow-up to TASK-051/052. Verified against the live app via screenshots.

# TASK-051: Business Day aggregate (decouple day close)

Status:
Proposed

Problem:
"End Day" conflates four unrelated lifecycle events — stopped driving, stopped
tracking time, job done, day over. Ending one must not end the others.

Business Value:
A flexible day container that never auto-closes; the foundation every other
Operations Engine concern hangs off.

Scope:
- New `business_days` table (migration 127): account/user/date, status
  `OPEN|ACTIVE|PAUSED|READY_TO_CLOSE|CLOSED|REOPENED`, opened/closed_at,
  reopened_reason, notes. Owns nothing — records reference it; it summarizes.
- Replace "End Day" with "Review & Close Day" in `my-day/MyDayView.tsx`; migrate
  `WorkdayPanel` start/end onto the container.

Out of Scope:
- Day Close checklist (TASK-054); payroll/activity/mileage internals.

Acceptance Criteria:
- [ ] Ending a trip / activity / job, or returning home, leaves the day OPEN.
- [ ] Only an explicit close sets CLOSED; Reopen works with a reason.
- [ ] Migration additive + reversible; account-scoped RLS.

Notes:
Phase 1. Foundation for the freeze gate.

# TASK-052: Payroll clock + payroll policies

Status:
Proposed

Problem:
There is no record of paid working time distinct from what task was being done.

Business Value:
Employee-style "was this person working?" time, independent of activity — the
basis for payroll and true labor burden.

Scope:
- New `time_clock_sessions` table (migration 128): business_day_id, clock_in/out,
  status, `pay_type (hourly|salary|piecework|subcontractor|owner_draw)`,
  hourly_rate_snapshot, break_policy, voided_at, correction_reason.
- All pay types derive from the one clock; only the calculation differs.
- Field Clock In / Clock Out; after clock-in prompt "What are you doing now?".

Out of Scope:
- Payroll calculation/payout; activity coupling (must stay independent).

Acceptance Criteria:
- [ ] Clock spans many activities; switching activity never touches the clock.
- [ ] Corrections void + re-add, never delete.
- [ ] Account-scoped RLS; additive migration.

Notes:
Phase 2.

# TASK-053: Activity + Assignment model

Status:
Proposed

Problem:
Activity today conflates the verb (driving, working) with the business object
(Job #241), so "same job, switched task" can't be expressed cleanly.

Business Value:
Clean job-costing: Activity = verb, Assignment = object; labor_bucket derives.

Scope:
- Extend `activity_entries` (migration 129, additive): `business_day_id`,
  `time_clock_session_id`, `labor_bucket (billable|overhead|personal|warranty)`,
  non-entity `assignment_kind (office|shop|inventory|training|none)`.
- Reuse `entity_type/entity_id` as the assignment link; extend the activity-verb
  enum + labels in `packages/domain/src/activities.ts`; map activity+assignment →
  labor_bucket. Reuse `/api/v1/activities/switch` for Change Activity/Assignment.

Out of Scope:
- Current Operations State (TASK-056); presence (TASK-057).

Acceptance Criteria:
- [ ] Activity verb and Assignment object are independently settable.
- [ ] labor_bucket mapping is a unit-tested pure rule.
- [ ] Switching keeps payroll running; one-active invariant preserved.

Notes:
Phase 3.

# TASK-056: Current Operations State (live state machine)

Status:
Proposed

Problem:
Nothing describes the user's current operational state, so automation has to
search/reconstruct context every time.

Business Value:
The app always knows NOW (clocked-in? · activity · assignment · vehicle ·
presence · pending question), making one-tap automation cheap.

Scope:
- A derived read-model (one API) computed from the open rows (clock session,
  activity entry, vehicle session, latest presence) — derive-first, no
  sync-prone cache table unless proven necessary.
- Expose current state + valid transitions; power proactive prompts.

Out of Scope:
- The inbox UI (TASK-049); persisting state history.

Acceptance Criteria:
- [ ] One endpoint returns the live state from open records.
- [ ] State transitions are documented and unit-tested.

Notes:
Phase 3. Pairs with TASK-053.

# TASK-057: Presence timeline

Status:
Proposed

Problem:
"Where was I present" is not modeled distinctly from "what was I doing," so
present-but-waiting (non-billable) time is invisible.

Business Value:
Presence vs Activity makes profitability and customer analytics honest (arrived
8:10, waiting to 8:30, billable from 8:30).

Scope:
- New `presence_intervals` table (migration 131): business_day_id, place
  (property/client or label), arrived_at, departed_at, source
  (gps_confirmed|manual). Derived primarily from confirmed `visit_candidates`.

Out of Scope:
- Billable logic (lives in activity labor_bucket).

Acceptance Criteria:
- [ ] A presence interval can hold multiple activities of differing buckets.
- [ ] Derives from confirmed visits; manual entry supported; additive + RLS.

Notes:
Phase 4 (after freeze gate).

# TASK-050: Link mileage ↔ travel-time + capture-method + reconcile

Status:
Proposed

Problem:
`vehicle_sessions` has no link to travel-time, no record of how a mileage number
was captured, and a drive can be logged twice (manual odometer + auto GPS).

Business Value:
Trustworthy mileage: one tap yields linked mileage + travel-time, every number
shows its capture method, duplicates reconcile.

Scope:
- Extend `vehicle_sessions` (migration 130, additive): `business_day_id`,
  `activity_entry_id` FK, `miles_source (odometer|manual_miles|gps_estimate|
  bt_gps_estimate)`, `status (open|closed|voided)`.
- One hybrid "Confirm trip" in `activities/segments/[id]`: atomic travel entry +
  linked session + segment stamp; segment is the dedup key. Odometer-vs-GPS
  reconcile (odometer wins, void never delete). Reuse `lib/mileage/sessions.ts`.

Out of Scope:
- BT pre-fill UI (rides this via TASK-025).

Acceptance Criteria:
- [ ] Confirming a drive yields one travel entry + one linked session; idempotent.
- [ ] Enclosing odometer close offers reconcile and voids GPS estimates.
- [ ] Capture method recorded and shown.

Notes:
Phase 5. Advances TASK-027; closes TASK-025's confirm UI.

# TASK-049: Operational Inbox (single review surface)

Status:
Proposed

Problem:
The owner sees location segments, visit candidates, drives, and mileage conflicts
as separate systems.

Business Value:
One review queue; one-tap arrival prompts powered by Current Operations State.

Scope:
- View-first `operational_review_items` (derived view/API; table only if
  persistent snooze/dismiss is needed). Union: detected_drive, detected_visit,
  unknown_stop, mileage_reconcile, missed_clock_out, idle_gap,
  unassigned_activity. Dedup via candidate-owns-stop (segment UNIQUE already).
- Confirm runs the TASK-050 hybrid action and stamps the matched scheduled
  visit's `arrived_at` (advances TASK-044).

Out of Scope:
- Persistent per-item state until proven necessary.

Acceptance Criteria:
- [ ] A drive, a low-confidence stop, and a missed clock-out surface in one list.
- [ ] No item appears twice; confirm links the right records.

Notes:
Phase 6. Relates to EPIC-007.

# TASK-054: Day Close checklist + Reopen

Status:
Proposed

Problem:
The blunt End Day button closes everything at once with no review.

Business Value:
A deliberate close after review; Reopen is normal, not an error.

Scope:
- Checklist gating `business_days → CLOSED` (payroll, activities, mileage,
  materials/expenses, inbox cleared/deferred, notes). Reopen with reason → ACTIVE.

Out of Scope:
- Locking historical records on close.

Acceptance Criteria:
- [ ] Close requires the checklist; Reopen records a reason and returns to ACTIVE.

Notes:
Phase 7.

# TASK-055: Operational Intelligence (profitability → automation)

Status:
Proposed

Problem:
With payroll/activity/mileage separated, the data can finally drive profitability,
pricing, and proactive automation — but nothing consumes it yet.

Business Value:
True labor burden feeds pricing (PI-004); the engine eventually acts on insights.

Scope:
- Daily roll-up (payroll vs billable vs overhead vs personal, mileage,
  present-not-billable) and job profitability incl. true labor burden.
- Wire true labor burden into PI-004
  (`docs/working/PRICING_INTELLIGENCE_CHARTER_DRAFT.md`).
- Value chain endpoint: insights → recommendations → automation (final consumer).

Out of Scope:
- Building automations before the data model is trustworthy.

Acceptance Criteria:
- [ ] Daily + per-job roll-ups derive purely from the separated ledgers.
- [ ] True labor burden is exposed for pricing.

Notes:
Phase 8. Built last. Connects to the Production Intelligence direction.

# TASK-040: False-drive detection

Status:
Done

Problem:
Passive location capture (TASK-024) produces false drives — parked Bluetooth
connect/disconnect cycles, GPS drift, and sub-minute teleport blips — that pile
up as unlabeled provisional segments the owner has to dismiss by hand.

Business Value:
The owner only ever sees real trips to label; noise is cleared automatically and
borderline cases are one tap.

Scope:
- A pure `classifyDrive` (packages/domain) that grades a closed drive by average
  speed: noise (<1 km/h, or under 60s), suspect (1–3 km/h), ok (≥3 km/h).
- Apply at capture: auto-dismiss noise, flag suspect (`location_segments.is_likely_noise`).
- One-time backfill of existing provisional drives (migration 120).
- Surface a "Likely noise" badge in the captured-segments panel with Dismiss as
  the primary action; Confirm stays available as an override.

Out of Scope:
- Auto-mileage from drives (still parked — see TASK-027).
- Re-classifying already confirmed/dismissed segments.

Acceptance Criteria:
- [ ] Sub-walking-pace / sub-minute drives are auto-dismissed at capture.
- [ ] Borderline drives are flagged and dismissable in one tap; real trips are
      untouched.
- [ ] Existing provisional drives are backfilled by the migration.
- [ ] `classifyDrive` is unit-tested against the real-data examples.

Notes:
Refines TASK-024 (location capture) and TASK-027 (hybrid tracking). Thresholds
live in `classifyDrive`; migration 120's backfill mirrors them.

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
