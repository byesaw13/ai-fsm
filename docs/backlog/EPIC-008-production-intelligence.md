# EPIC-008: Production Intelligence

Model **the work first**; treat pricing as one projection of that understanding.
Canonical direction: `docs/canonical/PRODUCTION_INTELLIGENCE.md`.

## Relationship to existing work (read first)

This epic is a **deliberate stub**. It does not open a large program of work.

- **TASK-018 (Assessment Summary Engine)**, in EPIC-002, is the current
  Production Intelligence foundation — the de facto PI-001. The shared
  `AssessmentSummary` shape, its consumers (materials, work orders, estimates,
  property timeline), and the `assumptions` / `missing_measurements` plumbing are
  already the base of this model. **Finishing TASK-018 is the prerequisite for
  this epic.** Do not start the tasks below until TASK-018 has proven the model
  in real use.
- Three tasks live here: the two PI stubs below plus **TASK-055 (Operational
  Intelligence)**, moved from EPIC-001 — it is the *consumer* of the Operations
  Engine's separated ledgers (payroll/activity/mileage), so it belongs in the
  value chain `Production → Pricing → Operations Intelligence → Recommendations`,
  not inside the engine that produces the data. Everything else
  Production-Intelligence shaped is held as **strategic concepts** (see the
  backlog README), explicitly not committed, until use validates the foundation.

The `PI-00x` labels below are the conceptual numbering from the Production
Intelligence direction; the `TASK-0xx` IDs are the canonical backlog IDs.

## Active tasks

# TASK-047: Work Item Library (PI-002)

Status:
Deferred

Phase:
4

Problem:
Work items are invented per estimate by the AI rather than owned by the
application. The same work ("Replace Vanity", "Drywall Patch") is re-described
from scratch every time, so labor, materials, and tools are inconsistent and
nothing accumulates.

Business Value:
The keystone of Production Intelligence. When the app owns a library of work
items, estimating becomes assembling known pieces instead of asking AI to invent
work. This is the single largest missing piece and the precondition for every
other Production Intelligence concept.

Scope:
- An application-owned library of reusable **work items** (not AI-generated per
  estimate).
- Each work item carries: typical labor, difficulty, required trades, typical
  materials, consumables, typical tools, and known risk factors.
- A work item can seed estimate line items and/or a work-order draft from the
  assessment summary.
- Reuse the canonical `AssessmentSummary.workItems` field as the consumption seam
  where it already exists.

Out of Scope:
- Historical-performance learning (held as a strategic concept).
- Pricing logic inside the work item — pricing is a downstream projection.
- A full Production Profile object with crew/skill/dependencies (later).
- AI-authored work items.

Acceptance Criteria:
- [ ] Work items exist as first-party records the app owns, independent of any
      single estimate.
- [ ] A work item can seed estimate line items or a work-order draft.
- [ ] Editing after applying is preserved (owner edits are never overwritten).
- [ ] Tests or documented manual verification cover seeding from a work item.

Notes:
Builds on the assessment-summary spine (`packages/domain/src/assessment-summary.ts`,
TASK-018) and `buildWorkOrderDraft` (`packages/domain/src/work-order.ts`). Gated on
TASK-018 proving the shared model in use.

# TASK-048: Confidence Engine (PI-006)

Status:
Deferred

Phase:
4

Problem:
Estimates present a single number as if certain, hiding how much is actually
unknown (measurements, selections, access conditions). There is no auditable
signal of *why* an estimate might be wrong.

Business Value:
Turns the AI from pretending certainty into exposing uncertainty. A confidence
signal — with reasons — makes estimates auditable and builds owner/client trust.
Cheap to start because the plumbing partly exists.

Scope:
- An overall confidence signal for an estimate, plus per-dimension confidence
  (e.g. labor, materials, measurements, unknown conditions).
- An explanation of *why* confidence is reduced (e.g. "ceiling height unknown",
  "vanity not selected", "flooring under vanity unknown").
- Reuse the existing `missing_measurements` / `assumptions` signals the materials
  generator already produces as inputs.

Out of Scope:
- Historical-performance-weighted confidence (strategic concept, later).
- Auto-blocking an estimate on low confidence — surface, don't gate.

Acceptance Criteria:
- [ ] An estimate exposes an overall confidence and at least one per-dimension
      breakdown.
- [ ] Low confidence is accompanied by human-readable reasons.
- [ ] Reasons are derived from real signals (e.g. missing measurements), not
      hardcoded.
- [ ] Tests cover the reason-derivation as a pure rule.

Notes:
The materials generator already emits `assumptions`, `missing_measurements`, and
`excluded_customer_supplied_items` (TASK-018). This task surfaces and structures
those into a confidence signal rather than inventing new capture. Gated on
TASK-018.

# TASK-055: Operational Intelligence (profitability → automation)

Status:
Proposed

Phase:
4

Problem:
With payroll/activity/mileage separated by the Operations Engine (EPIC-001), the
data can finally drive profitability, pricing, and proactive automation — but
nothing consumes it yet.

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
The last link in the chain — built only after the Operations Engine ledgers
(EPIC-001) and Site Presence (TASK-057) are trustworthy in real use. Moved here
from EPIC-001: it consumes the engine's output rather than being part of it.

# TASK-072: Per-task time capture via AI Daily Recap (baselines foundation)

Status:
Done

Phase:
3

Problem:
There are no per-task actuals to baseline against — the checklist items on a
work order are free-text JSONB, and `activity_entries` attach to job/visit, never
to a task. So "installing a faucet took X hours" cannot be established.

Business Value:
Actual time accumulates per task with almost no logging friction — at day's end
the tech/owner narrates the day and AI turns it into structured per-task time,
building the baselines that later drive costing and pricing.

Scope (Slice 1 — done):
- `work_order_tasks` (first-class checklist items, migration 155, backfilled from
  `completion_criteria`); `activity_entries.task_id` + `work_order` entity type
  (migration 156).
- AI Daily Recap: narration + candidate tasks → reviewable per-task time/status +
  non-task buckets; owner confirms; commit writes `activity_entries.task_id` and
  toggles task done/blocked. Design:
  `docs/superpowers/specs/` (approved plan lively-puzzling-perlis).

Out of Scope (Slice 1):
- AI *decomposition* of the task list (Slice 2); baseline analytics (Slice 3).

Slice 1b (shipped):
- Field checklist + complete gate + status sync load **`work_order_tasks`** as
  the source of truth (`loadWorkOrderCompletionCriteria`); seed from JSONB once
  for legacy WOs. Toggles + Daily Recap mirror back into `completion_criteria`.

Acceptance Criteria:
- [x] Time can be attributed to a task; the recap parses the owner's worked
      example into per-task time (unit-tested).
- [x] Owner reviews and confirms before anything is written; confirmed recap
      records per-task `activity_entries` and marks tasks done (merged + deployed).
- [x] One checklist source of truth (Slice 1b, office + field + complete gate).

# TASK-073: AI task decomposition (Slice 2)

Status:
Done

Phase:
3

Problem:
Work-order tasks (TASK-072) exist but are seeded only from estimate labor lines,
which are coarse ("Labor — T&M budget 90 hrs"). Baselines need discrete,
reusable tasks ("Replace faucet") — the owner's "use AI to divide and sub-divide
the tasks."

Business Value:
AI reads a job's estimate scope + rooms and proposes the work orders (areas) and
their task checklists, which the owner reviews and applies — turning a job into
baselineable units without hand-listing every task.

Scope (Slice 2 — done):
- `lib/estimates/task-decomposer.ts`: AI → { work_orders: [{ title, scope,
  tasks[] }] }, behind the ANTHROPIC_API_KEY guard. Unit-tested.
- POST /api/v1/estimates/[id]/decompose (draft, read-only) and .../apply (creates
  **one** work order + first-class tasks; flattens multi-area AI proposals).
- Improves the daily-recap prompt to prefer a matching candidate task over a
  non-task bucket (from the live shakedown finding).

Out of Scope:
- Decomposition from a free-form job description (estimate-driven for now).
- Baseline analytics (Slice 3).

Acceptance Criteria:
- [x] AI proposes work orders + discrete task checklists from an estimate (tested).
- [x] Owner reviews and applies; applied work orders carry first-class tasks
      (one WO per project by default; merged + deployed).

## Completed

- TASK-072 (incl. Slice 1b) and TASK-073 — 2026-07-22 on main / garonhome.
