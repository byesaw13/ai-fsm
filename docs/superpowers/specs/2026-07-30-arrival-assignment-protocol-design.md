# Arrival → Assignment Protocol — Design Spec

**Date:** 2026-07-30  
**Status:** Ready for user review  
**Approach:** Arrival → Assignment Protocol (brainstorming session)  
**Related:** EPIC-007 (Field Execution / Location Intelligence), TASK-041–045, TASK-079, TASK-077 (remains Deferred), `docs/canonical/OPERATIONS.md`, work-order-centric field model  

---

## Goal

While on the job, Dovetails detects likely site presence, proposes the right **project + work order (+ visit)**, and lets the owner authorize with **one smart tap** (HA Companion push or My Work banner). End-of-day Day Review uses the **same protocol** for leftovers. Confirmed labor attaches to the correct work order so project billing rollups are honest without manual re-keying.

**v1 billing seamlessness** means labor attaches correctly to project + work order (+ visit). It does **not** create draft invoice lines or auto-send invoices.

---

## Locked product decisions

| Decision | Choice |
|---|---|
| Scope | Full path: detect → low-friction confirm → correct WO → invoice-ready labor |
| Trust | Always one human action before billable/payroll-relevant activity is written |
| When to confirm | Live on high-confidence arrival **and** Day Review for the rest |
| Multi-WO | Always choose WO when more than one open WO at the property |
| Billing v1 | Correct `activity_entries` attachment; existing project invoice flow |
| Live surface | HA push **and** My Work banner (same confirm API) |
| Approach | Arrival → Assignment Protocol (not thin UI-only polish, not full Operational Inbox) |

---

## Principles

1. **Robot proposes; human confirms.** No silent auto-start (TASK-077 stays Deferred). No silent Confirm All that writes without an explicit UI action.
2. **One confirm action, three surfaces.** Push deep-link, My Work banner, and Day Review all call the same API.
3. **Work order is the assignment object** for field job work. Project (`jobs`) remains billing container; visit remains the daily field log under the WO.
4. **Extend `visit_candidates`, don’t invent a parallel table.** An “arrival proposal” is a product name for a enriched candidate, not a new entity.
5. **Sources of truth unchanged.** Activity labor → `activity_entries`; payroll → `time_clock_sessions`; mileage → `vehicle_sessions` (hybrid odometer); location evidence → `location_segments` / `visit_candidates`.

---

## Architecture

```
GPS (HA Companion) → location_events → segments (stop/drive)
  → match property (existing scorer)
  → visit_candidate as arrival proposal (pending)
  → live prompt (high confidence + workday) and/or Day Review
  → POST confirm (one API)
  → visit arrived/active + activity_entry (job_work) on work order
  → project labor rollup (existing invoice path)
```

### Components

| Component | Responsibility |
|---|---|
| Segment reducer | Unchanged stop/drive detection (TASK-024/040/076) |
| Matching engine | Unchanged property confidence scoring (TASK-042) |
| Proposal builder | Creates/updates pending `visit_candidates` with WO resolution metadata |
| Live notifier | Internal endpoint for HA push; My Work reads pending live-eligible proposals |
| Confirm service | Atomic: resolve WO, attach/create visit, write activity, mark confirmed |
| Day Review Visits section | Grouped property rows; same confirm/ignore/picker |

---

## Data model

### Extend `visit_candidates` (additive migration)

Existing columns already include `job_id`, `visit_id`, confidence, arrival/departure, status, classification, `activity_entry_id`.

**Add:**

| Column | Type | Purpose |
|---|---|---|
| `work_order_id` | UUID NULL FK → `work_orders` | Suggested or confirmed WO |
| `wo_resolution` | TEXT NOT NULL DEFAULT `'unknown'` | `clear` \| `ambiguous` \| `none` \| `resolved` |
| `live_eligible` | BOOLEAN NOT NULL DEFAULT FALSE | Met live-push thresholds at creation/update |
| `live_prompted_at` | TIMESTAMPTZ NULL | When HA push was requested (idempotent) |
| `confirmed_at` | TIMESTAMPTZ NULL | When owner confirmed |
| `departure_time` | allow NULL | **Change:** currently NOT NULL; NULL means stop still open / still on site |
| `duration_minutes` | allow NULL | **Change:** NULL while stop open; set on stop close |

**Rules:**

- One candidate per `location_segment_id` remains (existing unique constraint).
- Manual candidates (TASK-045) continue without segment when applicable.
- On stop close: set `departure_time` and `duration_minutes` from the segment.
- On open-stop dwell path (live): create/update candidate with `departure_time` NULL and `duration_minutes` NULL until the stop closes.

### Activity write contract (confirm job_work)

- `activity_type`: `job_work` (or mapped classification)
- `source`: `auto_visit` (existing allowed source)
- **Assignment:** `entity_type = 'work_order'`, `entity_id = work_order_id` (allowed since migration 156). This is the billable assignment object.
- **Visit link:** set `visit_candidates.visit_id` and advance the visit row (`arrived_at` / status). Do **not** dual-write a second activity with `entity_type = 'visit'` for the same session.
- Time: open activity if still on site (`ended_at` NULL); closed activity if departed (`started_at` = arrival, `ended_at` = departure)
- At most one open activity per account (existing partial unique index) — switch path ends the prior open entry first
- Never invent a work order silently

### Pure helpers (`packages/domain`)

1. **`resolveWorkOrderForProperty(...)`**  
   Inputs: open WOs at property, scheduled visits today, optional user override.  
   Outputs: `{ status: 'clear'|'ambiguous'|'none', workOrderId?, visitId?, candidates[] }`.  
   - Exactly one open WO → `clear`  
   - Multiple open WOs → `ambiguous` (even if one is scheduled today) — product decision  
   - Zero open WOs → `none`

2. **`isLivePromptEligible(...)`**  
   Workday open + confidence ≥ live threshold + distance-proven match + scheduled today (or equivalent high bar) + not already prompted.

---

## Confirm API

### `POST /api/v1/visit-candidates/{id}/confirm`

Product language: “arrival proposal.” Implementation reuses `visit_candidates` ids and routes under this path (no second resource name in the API).

**Body (optional overrides):**

```json
{
  "work_order_id": "uuid | null",
  "classification": "job_work | warranty | estimate | material | walkthrough | realtor",
  "visit_id": "uuid | null"
}
```

**Transaction (job_work path):**

1. Load pending candidate; reject if not pending (idempotent message if already confirmed/ignored).
2. Resolve WO: body override → stored `work_order_id` if `wo_resolution=clear|resolved` → single open WO → else `409 ambiguous_work_order`.
3. Resolve visit: override → scheduled-today visit for that WO → create today’s standard visit under WO (existing field-day create patterns).
4. Ensure visit is arrived/in progress; set `arrived_at` from proposal `arrival_time` if empty.
5. Write `activity_entry` per contract above; link `activity_entry_id` on candidate.
6. Set candidate `status=confirmed`, `work_order_id`, `visit_id`, `job_id`, `classification`, `confirmed_at`, `wo_resolution=resolved`.
7. Learn property coordinates from stop if missing (TASK-041).

**Ignore:** `POST /api/v1/visit-candidates/{id}/ignore` — set `status=ignored`; no ledger writes.

### Error codes

| Code | When |
|---|---|
| `409 ambiguous_work_order` | Multi open WO and no override |
| `409 activity_overlap` | Overlaps existing activity; include overlapping ids; UI can offer correct/replace via existing correction paths |
| `404` | Unknown id |
| `409 already_closed` | Already confirmed/ignored (message is friendly / idempotent) |
| `422` | WO not on property / visit–WO mismatch / invalid classification |

---

## Live UX

### When to fire live surfaces

All must hold:

1. Open business day (workday tracking active)
2. `live_eligible` true (high confidence, distance-proven, scheduled-today bar)
3. Candidate pending
4. `live_prompted_at` null (or re-prompt policy: only if still pending after N hours — v1: once)

### My Work banner

Sticky card when pending live-eligible proposals exist:

- Property name, suggested WO title (or “Choose work order”), arrival time, confidence
- **Single open WO:** primary **Confirm job work** (one tap)
- **Ambiguous:** primary **Pick WO…** then confirm
- Secondary: **Not this** → ignore
- Deep link query: `/app/my-work?proposal={id}` focuses that card

### HA Companion push

Primary trigger (matches existing HA→FSM patterns for start-day / day-review):

1. Location ingest (or dwell re-eval) creates/updates a **live-eligible** pending candidate.
2. Response (or a dedicated check endpoint HA can call after location posts) includes `arrival_prompt: { candidate_id, property_label, wo_title, deep_link }` when `live_prompted_at` is null and eligibility holds.
3. HA automation sends Companion notification and POSTs ack so FSM stamps `live_prompted_at` (idempotent).

- Notification copy: `At {property} — confirm {WO title}?`
- Deep link: `/app/my-work?proposal={candidate_id}`
- v1: prompt **once** per candidate (`live_prompted_at` set); no re-prompt loop

### Still on site vs already left

| State | Confirm result |
|---|---|
| Open stop (`departure_time` null) | Open `activity_entry` (`ended_at` null); visit in progress |
| Closed stop | Closed activity for arrival→departure duration |

---

## Day Review UX

- Reuse TASK-079 property grouping: one row per property with visit count + total minutes when multiple micro-stops.
- Actions: Job work / classification, Change WO, Ignore — all call shared confirm/ignore API.
- **Confirm all high-confidence** is an **explicit** multi-action control: one UI gesture that invokes confirm once per eligible proposal (N writes). Not background auto-confirm.
- Supplier / material suggestions remain classify-as-material; no WO inventing.

---

## WO picker (shared component)

Used by banner and Day Review when `wo_resolution=ambiguous` or user taps Change WO.

- Lists open work orders at property: title, status, scheduled-today badge
- Confirm disabled until selection when ambiguous
- Single WO skips picker

---

## Edge cases

| Case | Behavior |
|---|---|
| No open WO at property | `wo_resolution=none`; do not invent WO; allow non-job classifications or ignore; optional later: link project-only estimate/warranty paths |
| Already open `job_work` on another assignment | Confirm offers **switch**: end previous activity, open new on chosen WO |
| Time overlap with manual entry | Surface overlap with entry ids; use correction/replace path rather than opaque hard fail |
| Clocked out | Still allow activity write for job-cost assignment truth; payroll remains `time_clock_sessions` (do not silently clock in) |
| Duplicate micro-stops same property | Group in UI; one ledger row per real session on confirm |
| Home / private locations | No live push; filtered per TASK-046 |
| Wrong WO after confirm | Existing activity correction + re-link; candidate remains audit trail |
| Low confidence / unscheduled drive-by | Day Review only; no live interrupt |

---

## Explicit non-goals (this design)

- Full Operational Inbox (TASK-049) — future consumer of the same confirm action
- Silent auto-start of job_work (TASK-077 remains Deferred)
- Draft invoice lines or T&M auto-invoice package
- Auto-close activity on departure (optional follow-up prompt later)
- GPS mileage as source of truth (hybrid odometer remains)
- ML ranking of WO matches

---

## Testing

### Unit (`packages/domain`)

- `resolveWorkOrderForProperty`: single, multi, none, scheduled badges don’t auto-clear multi
- `isLivePromptEligible`: threshold matrix (workday, confidence, schedule, already prompted)

### Integration (`apps/web`)

- Confirm transaction: visit + activity + candidate status + optional coord learn
- Ignore path: no activity row
- `409 ambiguous_work_order` without override
- Open activity when `departure_time` null; closed when set
- Switch path when another `job_work` is open

### E2E smoke

- Day Review: confirm job work attaches activity to WO
- My Work: `?proposal=` surfaces confirm card (seeded candidate)

### Manual

- HA Companion push delivery and deep link on a real device

---

## Implementation sketch (not a plan)

Order of thin slices (for later planning skill):

1. Domain pure helpers + unit tests  
2. Migration: `work_order_id`, resolution, live fields, nullable departure  
3. Proposal builder: set WO resolution when creating candidates; open-stop live path  
4. Confirm/ignore API transaction  
5. My Work banner + deep link  
6. Day Review wire to shared confirm + WO picker  
7. HA internal arrival-prompt + automation notes  
8. E2E smokes  

---

## Success criteria

1. On a normal scheduled single-WO job day, confirming on-site presence is **one tap** (push or banner) and produces `job_work` on that WO without searching.
2. Multi-WO properties never silently attach to the wrong WO.
3. Day Review leftovers use the same confirm path; high-confidence multi-confirm is explicit and fast.
4. Project labor/cost views show auto-confirmed work without re-keying.
5. Zero billable activity rows created without a human confirm or ignore decision.
