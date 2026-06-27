# Operations Engine

## Principle

The Dovetails app does not merely *record* the business — it *runs* it: payroll,
the workday, field operations, profitability, pricing intelligence, and
eventually scheduling, dispatch, and workload forecasting. The architecture is an
**Operations Engine**. The historical ledger is one component of that engine, not
the whole of it — we do not let a ledger gradually acquire operational features;
we design the engine and treat the ledger as one of its records.

The central defect this model corrects: **"End Day" is overloaded.** A single
action has conflated four unrelated lifecycle events — *stopped driving*,
*stopped tracking time*, *job done*, *day over*. They are separate. Each concern
gets its own lifecycle; a live state always knows "now"; and the Business Day is
a pure aggregate that summarizes today's records and **owns nothing**.

## The model

```
                         OPERATIONS ENGINE
Current Operations State  ── always knows NOW: clocked-in? · activity · assignment
        │                     · vehicle · presence · pending question
        │ (live state machine; powers one-tap automation)
Business Day (aggregate)  ── summarizes today's records; OWNS NOTHING; OPEN…CLOSED, reopenable
        │
   five timelines ───────────────────────────────────────────────────
   ├── Payroll   time_clock_sessions   "Was I working?"
   ├── Presence  presence_intervals    "Where was I present?"
   ├── Activity  activity_entries      "What was I doing?" = Activity verb + Assignment object
   ├── Vehicle   vehicle_sessions      "How did I travel?"
   └── Location  location_segments     "Raw evidence (where was I?)"
        │
   Operational Inbox → Day Close → value chain ↓
```

**Hard rule:** closing one concern must never close the business day. Mileage
ending, an activity stopping, a job finishing, returning home — none of these
close the day. Only an explicit Day Close does, and **Reopen is a normal action**,
not an error (after-hours emergencies happen).

## Sources of truth

Each concern has exactly one source of truth. AI/automation *connects* these; it
never *owns* one (mirrors the Production Intelligence "sources of truth" rule).

| Concern | Source of truth |
|---|---|
| Live operational state | **Current Operations State** (derived read-model) |
| Day container | `business_days` (aggregate, owns nothing) |
| Payroll / paid time | `time_clock_sessions` |
| Presence (physical at a place) | `presence_intervals` |
| Activity / job-costing | `activity_entries` (verb + assignment) |
| Mileage | `vehicle_sessions` |
| Location evidence | `location_segments` / `visit_candidates` |
| Daily review | `operational_review_items` (derived view) |
| Billing / estimates | `invoices` / `estimates` |

## Current Operations State (the live state machine)

The engine always knows the user's current operational state. It is a **derived
read-model** computed from the open lifecycle rows (the open `time_clock_session`,
the open `activity_entry`, the active `vehicle_session`, the latest
presence/location) — derive-first, not a sync-prone cache. It exposes:

`{ clocked_in?, current_activity (verb), current_assignment (object),
   active_vehicle, last_presence, pending_question }` plus the valid transitions.

Illustrative transitions:

```
Clocked Out → Clock In → Activity=Office → Activity=Driving → Activity=Material Run
→ Activity=Job(#241) → Activity=Driving → Activity=Office → Clock Out
```

Why it matters: because the state is always known, automation is cheap. GPS
reports *driving*, then stops; the engine already knows the vehicle (Ram) and the
destination confidence (Smith Residence), so it asks one question —
*"Did you arrive at Smith Residence? Start Job / Estimate / Warranty / Material
Dropoff / Other"* — with no searching or navigation.

## Two key decompositions

**Activity = verb, Assignment = object.** Activity ∈ {driving, working,
estimating, cleaning, meeting, material-run, office, break, …}. Assignment = the
business object the work attaches to (Job #241, Estimate #88, Inventory, Office,
Training). A technician on Job #241 can switch demolition→installation: same
**assignment**, different sub-activity. In data: the assignment reuses
`activity_entries.entity_type/entity_id` (+ a small `assignment_kind` enum for
non-entity assignments: office/shop/inventory/training/none). `labor_bucket`
(billable | overhead | personal | warranty) **derives** from activity+assignment.

**Presence ≠ Activity.** Presence records "physically at place X from A–B";
Activity records what was being done within it. Arrived 8:10, *waiting* 8:10–8:30
(present, not billable), *working* 8:30+. One presence interval can hold several
activities of differing labor buckets. This split is what makes profitability and
customer analytics honest.

## Capture method (trust)

Every mileage number records how it was captured:
`miles_source ∈ {odometer, manual_miles, gps_estimate, bt_gps_estimate}`. A drive
produces **both** a mileage record and a linked travel-time `activity_entry`
(`vehicle_sessions.activity_entry_id`); the `location_segment` is the correlation
and dedup key. When an odometer session encloses GPS-estimate sessions, odometer
wins and the estimates are **voided** (never deleted).

## The value chain (automation is the final consumer)

```
Reality → Evidence → Operations → Profitability → Pricing Intelligence
       → Business Intelligence → Recommendations → Automation
```

Reports are never built first — they are only valuable once payroll, activity,
presence, and mileage are cleanly separated. The engine eventually *acts*:
*"3 Home-Depot trips for electrical fittings this week — add to standard truck
inventory?"* / *"7.2 hrs on estimates this week — above your normal for your close
rate."* True labor burden from this model feeds pricing (see
`docs/working/PRICING_INTELLIGENCE_CHARTER_DRAFT.md` and
`docs/canonical/PRODUCTION_INTELLIGENCE.md`) — the actuals loop pricing was
missing.

## Build discipline

The program is phased across three epics along a clean boundary — **EPIC-001 is
the engine (how it works); EPIC-007 (Field Execution) is the technician's field
experience on top of it; EPIC-008 (Production Intelligence) consumes the engine's
ledgers.** Foundation first, all in EPIC-001: **Business Day (051) → Payroll (052)
→ Activity + Current State (053/056)**, plus the **Time Truth Consolidation**
sub-program (TASK-061…065) that makes `activity_entries` the single source of
truth for time and retires the legacy `visit_time_logs` table — a backfill +
reader-swap (the visit transition already dual-writes both), strictly ordered and
gated behind an invoice-labor parity test. The mileage↔travel-time link
(TASK-050) stays in EPIC-001 as engine infrastructure.

A **freeze gate** follows the foundation: do not start the field-experience work —
Operational Inbox (049), mileage automation, Bluetooth, Day Map, Site Presence
(057), the Visit production surfaces (066/067), now in **EPIC-007** — or the
Operational/Production Intelligence work (055, in **EPIC-008**) until the
foundation is stable, or later work builds on concepts about to change.

Sources of truth are single and referenced, never duplicated (see the backlog's
"Favor references over ownership" principle): time is `activity_entries`, mileage
`vehicle_sessions`, materials `visit_parts`, photos `visit_media`, presence
`presence_intervals`; a Visit is a folder that references them. Migrations are
additive and reversible; corrections and reconciliation **void**, never delete;
every table is account-scoped under RLS.

## Status

Canonical direction. Implementation is incremental and gated per the phases above.
This doc leads; the schema and code record what is built. Revise here first when
the operational model changes.
