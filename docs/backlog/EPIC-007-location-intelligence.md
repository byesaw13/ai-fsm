# EPIC-007: Location Intelligence & Visit Detection

Use the phone's location (via Home Assistant) as a sensor and Dovetails as the
decision engine to detect **customer visits** — job arrivals, estimate visits,
warranty/callbacks, material runs, walkthroughs — and turn them into reviewed,
classified ledger entries. The robot detects; the owner confirms; only confirmed
visits touch billing, job history, or customer records.

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

# TASK-041: Customer-property geofences

Status:
Proposed

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
Proposed

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
Proposed

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
Proposed

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
Proposed

Problem:
GPS can be wrong or the address new; the owner needs to attach a visit by hand.

Scope:
- Quick action: select customer / create new property / link to existing job /
  create unscheduled visit — producing a candidate or ledger entry directly.

Acceptance Criteria:
- [ ] The owner can record a site visit manually when detection misses.

# TASK-046: Workday & privacy controls

Status:
Proposed

Problem:
Passive tracking needs guardrails.

Scope:
- Tracking active only during the workday; a pause-tracking control; hide
  private/home locations from reports; raw GPS retention window (30–90 days);
  confirmed ledger entries kept permanently.

Acceptance Criteria:
- [ ] Tracking can be paused and is bounded to the workday.
- [ ] Home/private locations don't surface in reports; raw GPS ages out on
      schedule while confirmed entries persist.

## Completed

_None yet._
