# EPIC-007: Field Execution

**How a technician experiences working in the field** — the counterpart to the
Operations Engine (EPIC-001, *how the engine works*). This epic owns the field
workflow end to end: arriving, executing work, capturing what happened, and
reviewing it. The data model these features feed (Business Day, Payroll, Activity,
the time/mileage ledgers) lives in EPIC-001; this epic is the field experience on
top of it.

**Location Intelligence is one subsystem inside Field Execution**, not its own
epic: the phone's location (via Home Assistant) is a sensor and Dovetails the
decision engine that detects **customer visits** — job arrivals, estimate visits,
warranty/callbacks, material runs, walkthroughs — turning them into reviewed,
classified ledger entries. The robot detects; the owner confirms; only confirmed
visits touch billing, job history, or customer records.

Subsystems in this epic: Location Intelligence (geofences, matching, visit
detection), Passive Capture, Bluetooth vehicle detection, Drive detection,
Mileage automation, Day Map, Visit Review, Operational Inbox, Site Presence, and
the Visit production surfaces (Production Rollup + Timeline).

## Relationship to existing work (read first)

This epic **extends TASK-024**, it does not replace it. The phone→FSM pipeline is
already live:

- **Ingest:** `POST /api/internal/location` (HA Companion → n8n/MQTT), incl.
  periodic GPS `location_update` points. **Reused as-is — no new ingest endpoint,
  no second `location_events` table.**
- **Dwell detection:** the stop/drive segment reducer (`packages/domain/src/
  location.ts`, `apps/web/lib/location/segments.ts`) already turns the GPS stream
  into stop/drive segments with arrival/departure + duration. A `stop` segment is
  the arrival/departure event this epic builds on. (False stops/drives are already
  filtered by TASK-040.)
- **Review + "only confirmed counts":** the captured-segments panel already does
  provisional → owner-confirm → ledger.
- **Ledger:** `activity_entries` already supports `entity_type` / `entity_id` /
  `source` / `category` — confirmed visits write here (source `auto_visit`, one of
  the allowed values), linked to job/visit/client. **No new `business_ledger_entry`
  table.**
- **Supplier zones:** `suggestActivityForZone` already tags supply houses.

What this epic **adds** (the missing layer): geocoded customer-property
geofences, a customer-property **matching engine with confidence scoring**, a
`visit_candidates` table, the **classification workflow** (job/warranty/estimate/
walkthrough/material/realtor), a manual "I'm at customer site" override, and
workday/privacy controls.

**Naming:** Dovetails already has a `visits` table = *scheduled job visits*
(`arrived_at`/`completed_at`). Detected presence is a **visit candidate**, never a
`visit`. A confirmed candidate may auto-fill a scheduled visit's `arrived_at`.

## Build order (thin slices)

Slice 1 (first): property geofences + matching engine + `visit_candidates`, with
candidates created from existing stop segments and surfaced as pending on the
review card. Later slices: full classification workflow + ledger write (042/044),
manual override (045), privacy controls (046).

## Tasks

# TASK-040: False-drive detection

Status:
Done

Phase:
1

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

# TASK-041: Customer-property geofences

Status:
Done

Phase:
1

Problem:
`properties` has only `address` — no coordinates — so the system can match the
generic supplier zones but not specific customer addresses.

Business Value:
The matching engine can recognize *which customer* a stop is at.

Scope:
- Add `latitude`, `longitude`, `geofence_radius_feet` (default ~150), and
  `property_type` to `properties` (additive migration); `is_active` already
  implied via existing fields — confirm or add.
- Establish property coordinates without a hard geocoder dependency: **learn the
  center from a confirmed visit** (store the stop's lat/long the first time the
  owner confirms a candidate at that property), with optional manual pin/geocode
  as a follow-up.

Out of Scope:
- A paid geocoding provider (revisit only if learn-from-confirmation is
  insufficient).

Acceptance Criteria:
- [ ] Properties can hold lat/long + geofence radius.
- [ ] A confirmed candidate sets/refines its property's coordinates.

# TASK-042: Customer-property matching engine + confidence scoring

Status:
Done

Phase:
1

Problem:
A closed stop has lat/long but no notion of *whose* property it is or how sure we
are.

Business Value:
Turns a raw stop into "probably Kim Tufts / Wells Property, 92%."

Scope:
- A **pure** scorer (`packages/domain`) mirroring the spec's weights: scheduled
  today +100, open job +75, recent +40, repeat/realtor +30, within 150 ft +40 /
  250 ft +25, stayed 5+ min +20 / 15+ min +30, known supplier +25, poor GPS −25.
- Match order: scheduled jobs today → open jobs → recent/repeat/high-value →
  all active properties → supplier zones → home/shop/storage/gas.
- Unit-tested against representative scenarios.

Out of Scope:
- ML/learning ranking (fixed weights to start).

Acceptance Criteria:
- [ ] Given a stop + candidate properties, the scorer returns ranked matches with
      a 0–100 confidence and the matched customer/property.
- [ ] Pure and unit-tested.

# TASK-043: visit_candidates table + creation from stops

Status:
Done

Phase:
1

Problem:
Detected visits need to be stored as reviewable items, separate from scheduled
job `visits`.

Business Value:
The detected-visit backlog the owner reviews.

Scope:
- New `visit_candidates` table, account-scoped like every other table:
  `account_id` (NOT NULL FK + RLS policies keyed off `app_account_id()`),
  `location_segment_id`, property_id, matched_customer_id, confidence_score,
  arrival_time, departure_time, duration_minutes,
  status (pending/confirmed/ignored), classification, linked_job_id,
  linked_estimate_id, source.
- When a `stop` segment closes (existing pipeline) and matches a property above a
  confidence floor, create a **pending** `visit_candidate`. Reuse the stop's
  arrival/departure/duration; never auto-confirm.
- Stop-noise guard: TASK-040 only filters false *drives* ("stops are never
  classified"), so candidate creation must not assume stops are clean — gate on
  the confidence floor plus a minimum dwell so brief stationary/GPS blips near a
  property don't mint candidates.

Out of Scope:
- Classification UI (TASK-044), manual creation (TASK-045).

Acceptance Criteria:
- [ ] A qualifying stop produces a pending candidate with confidence + timing.
- [ ] Candidates are independent of the scheduled-visit `visits` table.

# TASK-044: Review card + classification → ledger

Status:
Done

Phase:
1

Problem:
Pending candidates need owner review and a way to become real records.

Business Value:
One-tap classify turns a detected visit into a ledger entry (and optionally
advances a scheduled job).

Scope:
- A "Detected visit" card (Daily Operations Log / captured-segments surface):
  customer/property, time range, duration, confidence; classify buttons
  (Job Work / Warranty / Estimate Visit / Walkthrough / Material Drop / Realtor /
  Ignore).
- On confirm: write an `activity_entries` row using values the table actually
  accepts — `source = 'auto_visit'` (the allowed set is manual / auto_visit /
  auto_material_run / auto_estimate / backfill) and an `entity_type` from the
  allowed set (`job` / `visit` / `client` — there is no `property` entity type, so
  link to the strongest of job→visit→client), category/activity from the
  classification; set candidate `confirmed`. Optionally auto-fill a matched
  scheduled visit's `arrived_at`. Classifications map to existing `activity_type`s
  (no new ones needed).

Out of Scope:
- Job/estimate creation from a visit (link only, for now).

Acceptance Criteria:
- [ ] Classifying a candidate writes the correct ledger entry and marks it
      confirmed; Ignore marks it ignored with no ledger effect.
- [ ] A confirmed candidate can set its property's coordinates (TASK-041).

# TASK-045: "I'm at customer site" manual override

Status:
Done

Phase:
1

Problem:
GPS can be wrong or the address new; the owner needs to attach a visit by hand.

Scope:
- Quick action: select customer / create new property / link to existing job /
  create unscheduled visit — producing a candidate or ledger entry directly.

Acceptance Criteria:
- [ ] The owner can record a site visit manually when detection misses.

# TASK-046: Workday & privacy controls

Status:
In Progress

Phase:
1

Problem:
Passive tracking needs guardrails.

Scope:
- Tracking active only during the workday; a pause-tracking control; hide
  private/home locations from reports; raw GPS retention window (30–90 days);
  confirmed ledger entries kept permanently.

Acceptance Criteria:
- [x] Tracking can be paused and is bounded to the workday. (slice 1, PR #373)
- [x] Home/private locations don't surface in reports; raw GPS ages out on
      schedule while confirmed entries persist. (slice 2, Phase 1)

Notes:
Slice 1 (PR #373): master enable/disable + pause + Start-Day workday gating.
Slice 2: `isPrivateLocation` report filtering, worker retention prune, settings UI.

# TASK-049: Operational Inbox (single review surface)

Status:
Proposed

Phase:
1

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

# TASK-057: Site Presence

Status:
Proposed

Phase:
1

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

# TASK-066: Visit Production Rollup (Visit Summary page)

Status:
Proposed

Phase:
1

Problem:
A Visit owns scheduling and field execution but exposes no production summary.
The real record of a session — time, mileage, materials, photos, checklist,
notes — is scattered across the separated ledgers with no single screen that
rolls it up for one production session.

Business Value:
The Visit becomes the production-session dashboard — the screen actually used on
multi-day projects to see "what happened on this visit" at a glance.

Scope:
- Build the Visit Summary page: roll up, for one visit, payroll, activities,
  mileage, materials, photos, checklist, and notes.
- **Reference, never duplicate** (see "Favor references over ownership" in the
  README): the page reads from the sources of truth — `activity_entries` (time),
  `vehicle_sessions` (mileage), `visit_parts` (materials), `visit_media` (photos),
  checklist items — via the visit linkage. No new visit-owned copies of any of it.
- Read-only rollup first; editing stays on each source's own surface.

Out of Scope:
- Promoting Work Order to a production container (interim model stays
  `Job → Visit → activity_entries`).
- Multi-visit / job-level rollups (that is TASK-055 territory, EPIC-008).

Acceptance Criteria:
- [ ] One visit shows payroll, activities, mileage, materials, photos, checklist,
      and notes in a single view.
- [ ] Every figure traces to a source-of-truth record (no duplicated storage).

Notes:
Depends on the time truth being clean (TASK-061…065) and Site Presence
(TASK-057). The daily workspace for multi-day production. This is the screen the
owner will actually use day-to-day.

# TASK-067: Visit Timeline

Status:
Proposed

Phase:
1

Problem:
The Visit Production Rollup (TASK-066) shows totals, but not the *sequence* of a
visit — when the clock started, the arrival, the demo / material-run / install
segments, the departure. The chronological story is what makes a visit legible
after the fact.

Business Value:
A scannable timeline of a production session (Clock In → Arrived → Demo →
Material Run → Install → Leave → Summary). High value for reconstructing
multi-day jobs, settling disputes, and later production learning.

Scope:
- Render a chronological timeline for one visit from the separated ledgers:
  payroll clock events, activity segments (verb + assignment), mileage trips, and
  arrival/departure (Site Presence), keyed off `started_at` / `ended_at`.
- Reference-only, same discipline as TASK-066 — derived from the sources of
  truth, no new timeline table.

Out of Scope:
- Editing events from the timeline (each source owns its own correction path).

Acceptance Criteria:
- [ ] A visit renders an ordered timeline of its clock / activity / mileage /
      presence events with timestamps.
- [ ] The timeline derives purely from existing ledgers (no duplicated storage).

Notes:
Builds on TASK-066. Becomes more valuable as production history accumulates —
feeds the Production Intelligence learning loop (EPIC-008) later.

## Completed

- [TASK-024: Passive location-based activity capture](../archive/backlog-done/TASK-024-passive-location-capture.md)
- [TASK-025: Bluetooth-triggered, vehicle-aware auto-mileage](../archive/backlog-done/TASK-025-bluetooth-auto-mileage.md)
- [TASK-026: Day Map (stops + drive routes)](../archive/backlog-done/TASK-026-day-map.md)
- [TASK-027: Hybrid tracking — manual mileage, auto time](../archive/backlog-done/TASK-027-hybrid-tracking.md)
- TASK-041..045 shipped — see git history (PRs #368/#372).
