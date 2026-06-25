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
- Only two tasks live here on purpose. Everything else Production-Intelligence
  shaped is held as **strategic concepts** (see the backlog README), explicitly
  not committed, until use validates the foundation.

The `PI-00x` labels below are the conceptual numbering from the Production
Intelligence direction; the `TASK-0xx` IDs are the canonical backlog IDs.

## Active tasks

# TASK-047: Work Item Library (PI-002)

Status:
Proposed

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
Proposed

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

## Completed

_None yet._
