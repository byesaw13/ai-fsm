# Work Order–Centric Field Model — Design Spec

**Date:** 2026-07-02  
**Status:** Approved — canonical assignment/field UX per `docs/canonical/DOMAIN_MODEL.md`  
**Supersedes (partially):** `2026-07-01-job-work-order-visit-model-design.md` — field UX, assignment, completion authority, and customer communication sections  
**Preserves:** July 2026 schema (`work_orders`, `visits.work_order_id`, completion criteria, visit-scoped labor/ledger)

---

## Goal

Shift Dovetails OS center of gravity so the **work order** is the unit of field responsibility, customer communication, automation, and completion — without rewriting the data model shipped in PR #447.

| Layer | Backend | UI label | Answers |
|---|---|---|---|
| Sales | `estimates` | Estimate | What was sold? |
| Commitment | `jobs` | **Project** | What is the customer's overall engagement? |
| **Responsibility** | `work_orders` | **Work Order** | What work am I responsible for finishing? |
| Field log | `visits` | Visit | What happened today on site? |
| Pre-work | `visits` (no WO) | **Assessment** | Pre-sale / inspection activity that may never become a WO |

**Design principle:** Customers think in projects and work. Techs think in visits. The app translates between those mental models. **Customer-facing copy never says "visit".**

---

## Problem statement

PR #447 wired the schema correctly (project → work order → visit) but the **field surface** still treats visits as the primary object:

- My Day lists visits, not assigned work orders
- Tech assignment lives on `visits.assigned_user_id`; WO has only `preferred_technician_id` (hint)
- Visit completion feels like job completion
- Work Orders nav is office-centric and disconnected from Projects
- Automations (`visit_reminder`, etc.) are visit-keyed; customer SMS lacks WO framing
- No unified WO timeline for field + customer + status history

This spec corrects ownership and UX while reusing existing tables.

---

## Canonical hierarchy (revised)

```text
Lead
  ↓
Assessment (pre-work visit, no work_order_id)
  ↓
Estimate
  ↓ (accepted)
Project
  ↓
Work Order(s)          ← lead assigned, scope, comms, automation, closeout
  ↓
Scheduled Visit(s)     ← calendar / dispatch plan
  ↓
Active Visit(s)        ← daily field log (Start or Resume)
  ↓
Work Order Complete
  ↓
Project billing / close
```

**Rules:**

- Office schedules visits. Tech owns work orders. Starting work activates or creates today's visit.
- Visits document progress; they do not own completion.
- Assessments live outside the WO queue until estimate acceptance promotes a draft WO.

---

## Entity responsibilities

### Project (`jobs`)

Long-lived customer engagement. Billing and invoices stay project-level only.

**Owns:** client, property, overall status, estimates, invoices, rollup of completed work orders.

### Work Order (`work_orders`) — central business object

Executable work packet and **system of record for customer-facing work**.

**Owns:**

| Domain | Examples |
|---|---|
| Scope | Rooms, tasks, materials plan |
| Schedule | Next appointment (derived from scheduled visits) |
| **Communication** | Reminders, confirmations, on-the-way, customer replies, estimate/invoice notices |
| Visits | Scheduled + completed journal (child records) |
| Materials | Planned vs actual rollup from visits |
| Completion | Checklist / completion criteria |
| Closeout | Lead marks WO complete |
| Assignment | `assigned_user_id` — single lead tech |
| Automation anchor | Twilio gatekeeper, reminder idempotency |
| Timeline | Unified chronological feed |

**Does not own:** per-day GPS/travel granularity (visits), invoice payment state (project).

**Statuses (existing enum, refined meaning):**

| Status | Meaning |
|---|---|
| `draft` | Pre-acceptance scope packet; no visits; not schedulable |
| `ready` | Accepted; lead assigned; not on calendar |
| `scheduled` | On calendar (future scheduled visit exists) |
| `dispatched` | Active field execution underway (lead has open visit) |
| `waiting` | Blocked between visits (parts, customer, weather) |
| `completed` | Lead closed out; required criteria met |
| `cancelled` | Abandoned |

Reserved: `approved`, `closed` (future).

**Status derivation:**

- `scheduled` ← future scheduled visit(s), no active visit
- `dispatched` ← lead has visit in `arrived` / `in_progress` / `traveling` / `waiting`
- `waiting` ← manual block or explicit "blocked" between visits
- `completed` ← lead action only; never from visit `completed` alone
- Visit `completed` → WO returns to `scheduled` if more visits planned, else stays open until lead completes criteria

### Visit (`visits`)

Daily execution record — **journal entry against the work order**.

**Two modes:**

| Mode | Created by | Purpose |
|---|---|---|
| Scheduled | Office, quick-book, self-schedule | Calendar slot, conflict check, reminder timing |
| Active | Lead taps **Start Today's Visit** or **Resume Work** | Today's field log |

**Hybrid C — Start logic:**

1. WO has scheduled visit today for lead → promote to active (`arrived`/`in_progress`), set `active_start`
2. Else → create ad hoc visit under WO
3. Only one active visit per WO per lead at a time

**Owns:** `scheduled_start/end`, `active_start/end`, daily notes, photos, materials used, labor, **crew/helpers** (visit-level), GPS/travel states.

**Does not own:** job completion, customer satisfaction trigger, invoice generation.

**End visit** = "done for today." **Complete work order** = "this scope is finished."

### Assessment (operational visits, no `work_order_id`)

Pre-work activities that may never become a work order.

**Types:** `site_visit`, `realtor_baseline`, `sales_walkthrough`, `membership_health_check`

**UI label:** **Assessments** (not "Operational"). Shown as second strip in My Work.

---

## Schema deltas (v1)

```sql
-- Work order lead assignment
ALTER TABLE work_orders
  ADD COLUMN assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Customer communication / gatekeeper (Phase 2+)
ALTER TABLE work_orders
  ADD COLUMN customer_confirmed_at TIMESTAMPTZ,
  ADD COLUMN communication_status TEXT;  -- optional: pending_confirmation | confirmed | ...

-- Visit field log timestamps (or map arrived_at / completed_at if preferred)
ALTER TABLE visits
  ADD COLUMN active_start TIMESTAMPTZ,
  ADD COLUMN active_end TIMESTAMPTZ;

-- Visit crew (v1: JSONB array of user_ids; v2: visit_crew_members table)
ALTER TABLE visits
  ADD COLUMN helpers JSONB NOT NULL DEFAULT '[]';
```

**Backfill:** `work_orders.assigned_user_id` ← most recent `visits.assigned_user_id` per WO.

**Deprecate (soft):** `preferred_technician_id` → default suggestion when scheduling only.

**Future (not v1):** `work_order_crew_members` for shared WO ownership (option B).

---

## Work Order hub structure

When opening a WO, the **cockpit** answers four questions before tabs:

| Question | Cockpit element |
|---|---|
| What am I doing? | Title + scope summary / today's goal |
| Where am I? | Client + property address (tap navigate) |
| What's next? | Next appointment datetime |
| Am I blocked? | Status + block reason (e.g. "Waiting on countertop") |

**Example cockpit (field view):**

```text
Bathroom Refresh
Peter Marinelli · 12 Oak St

Status          Waiting on countertop
Today's goal    Install trim
Next appointment Friday 9:00 AM
Outstanding     3 checklist items

[ Start Today's Visit ]  or  [ Resume Work ]
```

### WO sections (tabs / hub)

```text
Work Order
├── Cockpit (always visible)
├── Scope          — completion criteria checklist
├── Schedule       — scheduled visits + calendar link
├── Communication  — customer interaction timeline (first-class)
├── Visits         — daily journals (completed + upcoming)
├── Materials      — planned vs actual
├── Photos         — rollup from visits
├── Time           — labor rollup from visits
├── Documents      — linked project docs
└── Closeout       — lead completes WO (criteria gate)
```

### Work Order Timeline (first-class)

Unified chronological feed on the WO — one of the most useful screens.

**Event types merged into single feed:**

| Source | Examples |
|---|---|
| Status | Estimate accepted, scheduled, waiting, completed |
| Visits | Visit #1 — vanity removed; Visit #2 — countertop installed |
| Communication | Reminder sent, customer confirmed (YES), on the way, customer replied |
| Scheduling | Appointment created/rescheduled |
| Media | Photos uploaded (rollup) |
| Documents | Estimate opened, invoice notice |

**Example:**

```text
Jul 2   Estimate accepted
Jul 4   Scheduled — Friday 9 AM
Jul 8   Customer confirmed (SMS YES)
Jul 9   Visit #1 — Vanity removed · 4 photos
Jul 11  Visit #2 — Countertop installed · 6 photos
Jul 14  Completed by Nick
```

Implementation: query `workflow_events`, `audit_log`, visits, and `work_order_communications` (new or extended) into a read-model projector. v1 may compose from existing tables; dedicated `work_order_timeline_events` table is optional follow-on.

---

## Customer communication (first-class WO responsibility)

Communication is not "just reminders" — it is a **core WO domain** alongside scope and schedule.

### Design principles

1. Every customer interaction attaches to the **WO timeline**
2. Customer SMS/email **never says "visit"** — speaks in work-order language ("your bathroom refresh", "your scheduled appointment Tuesday 9 AM")
3. Internal ops (labor, GPS, activity ledger) stay visit-scoped
4. Twilio gatekeeper is the **Communication Manager** for the WO lifecycle

### Communication event types (WO timeline)

- Appointment reminder sent
- Customer confirmed (`customer_confirmed_at`)
- Estimate opened / sent
- Estimate accepted
- Technician on the way
- Customer replied (inbound SMS)
- Work completed notice
- Invoice notice (may also appear on project)

### Automation architecture

```text
Work Order
    ↓
Communication Manager (worker + Twilio)
    ↓
Scheduled Visit (timing trigger only)
    ↓
Automation rule
```

| Automation | Trigger | Timing from | Customer message framing |
|---|---|---|---|
| Appointment reminder | WO + next scheduled visit | `visits.scheduled_start` | "Your bathroom refresh is scheduled Tuesday 9 AM" |
| Confirmation (Reply YES) | WO scheduled | visit created/changed | "Reply YES to confirm your appointment" |
| On the way | WO `dispatched` | visit → `traveling` | "Nick is on the way for your bathroom refresh" |
| Completed / survey | WO `completed` | lead closes WO | "Your bathroom refresh is complete" |
| Invoice notice | Project | invoice event | unchanged |

**Gatekeeper flow:**

```text
WO scheduled
  → Twilio reminder
  → Customer replies YES
  → WO.customer_confirmed_at set
  → WO Timeline updated
  → Technician arrives → visit active log
```

**Phased worker changes:**

| Phase | Change |
|---|---|
| 1 | Enrich `visit_reminder` templates with WO title; join `work_orders` in query |
| 2 | `work_order_reminder` automation type; idempotency `(work_order_id, visit_id, type)` |
| 3 | Inbound YES/NO → `customer_confirmed_at`; Communication tab + timeline |

---

## My Work (replaces My Day)

### Navigation

| Before | After |
|---|---|
| My Day `/app/my-day` | **My Work** `/app/my-work` |
| Tech primary surface | WO queue + Assessments strip |

Redirect `/app/my-day` → `/app/my-work`.

### Layout

**Strip 1 — Active Work Orders**

Query: `work_orders` where `assigned_user_id = current_user` and `status NOT IN (draft, completed, cancelled)`.

Sort: active visit → scheduled today → scheduled future → ready.

Card shows: client, WO title, status, next appointment.

**Strip 2 — Assessments** (renamed from "Operational")

Query: visits assigned to me where `work_order_id IS NULL` and `visit_type` ∈ operational types.

Label: **Assessments** or **Pre-Work** (prefer **Assessments** in UI).

### Routes

| Route | Audience | Purpose |
|---|---|---|
| `/app/my-work` | Field | WO queue + assessments |
| `/app/my-work/[workOrderId]` | Field | WO cockpit + hub |
| `/app/my-work/visits/[visitId]` | Field | Active visit log (slim execution UI) |
| `/app/work-orders/[id]` | Office | Edit scope, assign lead, split |
| `/app/jobs/[id]` | Office | Project hub, billing |

Same record, different lenses.

---

## Start / Resume Visit flow

### Primary CTA (context-aware)

| State | Button |
|---|---|
| No active visit today | **Start Today's Visit** |
| Active visit exists (lead closed app, lost signal) | **Resume Work** |

Both route to the same active visit execution surface.

### API

`POST /api/v1/work-orders/[id]/start-visit`

1. Verify `session.user = work_orders.assigned_user_id`
2. If open active visit for this WO + lead → return existing visit (Resume path)
3. Else find today's scheduled visit for lead → promote + `active_start = now()`
4. Else INSERT ad hoc visit
5. Derive WO → `dispatched`
6. Return visit id → redirect to field execution surface

### End visit vs complete WO

| Action | Who | Effect |
|---|---|---|
| End Today's Visit | Lead | Visit `completed`, `active_end` set; WO stays open |
| Complete Work Order | Lead | WO `completed` if criteria met, no open visit |

---

## Office scheduling changes

- `assigned_user_id` required when WO moves to schedulable state (`ready` → `scheduled`)
- `preferred_technician_id` pre-fills assignee in UI only
- Schedule flow: pick WO → pick lead → pick slot → create scheduled visit
- Calendar primary label: **WO title + client**; slot = visit time
- Quick-book: set `assigned_user_id` on WO from selected tech

---

## Assignment model (v1)

| Level | Field | Meaning |
|---|---|---|
| Work Order | `assigned_user_id` | Single lead; owns scope, comms, closeout |
| Visit | `assigned_user_id` | Lead for that day's log (defaults to WO lead) |
| Visit | `helpers` | Crew on site (Nick + Winston) |

**Not v1:** `work_order_crew_members` (option B — multiple leads on one WO).

---

## Completion model

**Lead completes work order** when:

- All required completion criteria checked
- No open visit on this WO
- (Future) office approval threshold for large jobs

**Visit completion** does not complete the WO. Multiple visit completions over days; one WO completion.

---

## Implementation phases (field-first)

| Slice | Deliverable |
|---|---|
| **6** | Migration: `assigned_user_id`, `active_start/end`, `helpers`; backfill |
| **7** | My Work queue + Assessments strip; rename nav |
| **8** | WO cockpit + hub tabs (Scope, Visits, Materials); Start/Resume API |
| **9** | Field visit surface (End Visit, not Complete Job); WO complete by lead |
| **10** | WO Timeline read model (v1 compose from existing events) |
| **11** | Communication tab + template pivot (Phase 1 reminders) |
| **12** | Calendar labels + office assign-on-schedule |
| **13** | Twilio gatekeeper + `customer_confirmed_at` (Phase 2–3) |

Slices 6–9 deliver the ownership fix for techs. 10–13 align office, timeline, and customer comms.

---

## Testing strategy

- Unit: Start/Resume logic, WO status derivation, completion gates
- Integration: `assigned_user_id` backfill, visit promote vs ad hoc create
- E2E: tech My Work → Start Visit → End Visit → WO still open → Complete WO
- E2E: assessment strip separate from WO queue
- Worker: reminder idempotency keyed on WO + visit

---

## Out of scope (v1)

- `work_order_crew_members` (multi-lead WO)
- Milestone layer between project and WO
- Customer portal redesign (principle applies; portal work separate)
- Renaming `/app/work-orders` global list (office queue remains; field uses My Work)

---

## Relationship to July 2026 spec

| July spec rule | This spec |
|---|---|
| Visits own tech assignment | **Revised:** WO owns lead; visit owns helpers |
| Visits own field execution detail | **Preserved** |
| WO owns completion criteria | **Preserved;** lead authority explicit |
| Labor visit-scoped | **Preserved** |
| Ledger visit-scoped | **Preserved** |
| Invoice project-scoped | **Preserved** |
| Customer comms | **Elevated to WO-first** |

---

## Approval

- [x] §1 Entity model — approved 2026-07-02
- [x] §2 My Work + Start/Resume — approved with cockpit + timeline additions
- [x] §3 Office + automation — approved with Communication as first-class WO domain
- [ ] User review of written spec file
- [ ] Implementation plan (`writing-plans`)