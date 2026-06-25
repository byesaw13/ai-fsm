# Dovetails FSM — Product Backlog

This is the **active product backlog** for Dovetails FSM. It exists so future
work is tracked intentionally in the repo instead of being scattered across
chat sessions.

This backlog was created as an initial pass from recent planning discussions.
The tasks here did **not** previously exist as a tracked list — this is the
first time they are written down in one place.

## Working rule

**No new work may be started unless it maps to an existing task here, or a new
task is added to this backlog first.** If nothing fits, add a `Proposed` task
(correct epic, the standard headings below) before writing code. Adding the task
can be the first step of the same effort, but the task must exist before the
work.

A task closes when its acceptance criteria are met — it then moves to `done/`.
Do not keep a task open because new ideas surfaced during the build; new ideas
become new tasks, which earn their place only after the shipped feature proves
its value in use.

## Design principles

These cross-cutting rules guide how tasks here are scoped and built. They are
working guidance, not yet canonical product direction — promote to
`docs/canonical/` if they prove durable.

### Mobile First Field Rule

> Any action performed more than ~5 times per day should be executable in one
> tap whenever possible.

Dovetails is run from a phone in the field. Reduce typing, reduce modal dialogs,
reduce navigation; increase one-tap actions. When this rule and "software
purity" disagree, field reality wins. TASK-021 (Quick Activity Switching),
TASK-022 (Smart Start Day), and the prevention-over-correction framing of
TASK-019 all derive directly from this principle.

## How this relates to the canonical docs

- **`docs/canonical/ROADMAP.md` remains the product-direction source of truth.**
  When the backlog and the canonical roadmap disagree about scope or direction,
  the canonical roadmap wins.
- Backlog items are **implementation candidates**, not architectural authority.
  A task being listed here does not commit the product to building it.
- Product-scope changes still follow the rules in `CLAUDE.md`: canonical docs
  are updated first or in the same change.

## Structure

- `README.md` — this file.
- `EPIC-001-operations-and-mileage.md`
- `EPIC-002-estimating-and-assessments.md`
- `EPIC-003-property-intelligence.md`
- `EPIC-004-billing-and-profitability.md`
- `EPIC-005-platform-and-delivery.md`
- `EPIC-006-role-based-workspaces.md`
- `EPIC-007-location-intelligence.md`
- `EPIC-008-production-intelligence.md` — deliberate stub (PI-002, PI-006 only).
- `done/` — completed tasks, moved out of the active epics.

Each epic file lists its **active** tasks in full and links to its **completed**
tasks in `done/`.

## Task index

Next available ID: **TASK-049**.

| ID | Title | Epic | Status |
| --- | --- | --- | --- |
| TASK-001 | Vehicle Mileage Sessions | 001 | Done |
| TASK-002 | Vehicle Session Recovery | 001 | Done |
| TASK-003 | Wrong Vehicle Correction | 001 | Done |
| TASK-004 | Daily Operations Log | 001 | Done |
| TASK-005 | Activity Tracking | 001 | Done |
| TASK-006 | Assessment → Materials Generator Context | 002 | Done |
| TASK-007 | Assessment → Estimate Context | 002 | Done |
| TASK-008 | Room-Based Estimate Templates | 002 | Proposed |
| TASK-009 | Estimate Versioning | 002 | Proposed |
| TASK-010 | Property Timeline | 003 | Done |
| TASK-011 | Property Opportunities | 003 | Proposed |
| TASK-012 | Property Health Records | 003 | Proposed |
| TASK-013 | Maintenance Plan Fit Scoring | 003 | Proposed |
| TASK-014 | Invoice Generation from Visits | 004 | Done |
| TASK-015 | Payment Tracking | 004 | Done |
| TASK-016 | Job Profitability | 004 | Done |
| TASK-017 | Lead Source / Referral ROI | 004 | In Progress |
| TASK-018 | Assessment Summary Engine | 002 | In Progress |
| TASK-019 | Activity Timeline Correction | 001 | Done |
| TASK-020 | PWA Installability | 005 | In Progress |
| TASK-021 | Quick Activity Switching | 001 | Done |
| TASK-022 | Smart Start Day | 001 | Done |
| TASK-023 | End of Day Checklist Wizard | 001 | Proposed |
| TASK-024 | Passive Location-Based Activity Capture | 001 | In Progress |
| TASK-025 | Bluetooth-Triggered Vehicle-Aware Auto-Mileage | 001 | In Progress |
| TASK-026 | Day Map (stops + drive routes) | 001 | In Progress |
| TASK-027 | Hybrid Tracking (manual mileage, auto time) | 001 | In Progress |
| TASK-028 | Phase 0 — Extract WorkdayPanel | 006 | Proposed |
| TASK-029 | Phase 1 — My Day becomes the field home | 006 | Proposed |
| TASK-030 | Phase 2 — Slim the Owner Dashboard | 006 | Proposed |
| TASK-031 | Phase 3 — Role routing & hardening | 006 | Proposed |
| TASK-032 | Phase 4 — Owner widgets & polish | 006 | Proposed |
| TASK-033 | Read-Only Business MCP Server | 005 | In Progress |
| TASK-034 | MCP Non-Superuser RLS Verification | 005 | Proposed |
| TASK-035 | MCP Write Tools v1 (operations writes) | 001 | Proposed |
| TASK-036 | PR Gatekeeper MCP Server | 005 | In Progress |
| TASK-038 | Surface consolidation (one daily home) | 006 | Done |
| TASK-039 | Job & estimate numbering | 005 | Done |
| TASK-040 | False-drive detection | 001 | Done |
| TASK-041 | Customer-property geofences | 007 | Done |
| TASK-042 | Property matching engine + confidence | 007 | Done |
| TASK-043 | visit_candidates table + creation from stops | 007 | Done |
| TASK-044 | Visit review card + classification → ledger | 007 | Done |
| TASK-045 | "I'm at customer site" manual override | 007 | Done |
| TASK-046 | Workday & privacy controls | 007 | In Progress |
| TASK-047 | Work Item Library (PI-002) | 008 | Proposed |
| TASK-048 | Confidence Engine (PI-006) | 008 | Proposed |

## Status legend

| Status | Meaning |
| --- | --- |
| `Proposed` | Idea captured; not yet committed or scoped for build. |
| `Ready` | Scoped and ready to pick up. |
| `In Progress` | Actively being built. |
| `Done` | Shipped. Lives in `done/`. |
| `Deferred` | Intentionally on hold. |

## Handling completed work

When a task is finished, set its status to `Done` and move its file into
`docs/backlog/done/`. Leave a one-line link to it under the epic's
"Completed" section so the epic still reads as a coherent history.

**Task IDs are permanent and must never be reused, even after moving tasks to
done.** A retired or deleted task keeps its number; new work always takes the
next unused `TASK-XXX`.

## Task format

```
# TASK-XXX: Title

Status:
Proposed | Ready | In Progress | Done | Deferred

Problem:
What pain this solves.

Business Value:
Why it matters for Dovetails.

Scope:
- item

Out of Scope:
- item

Acceptance Criteria:
- [ ] criteria

Notes:
Any relevant implementation notes.
```

## Proposed / Strategic concepts (not yet committed)

These were discussed but are **not implemented** and are **not** in the canonical
roadmap. They are held per the roadmap's "Out of Scope" guidance until the core
workflow phases are stable. They are recorded so the ideas are not lost, not to
signal a commitment to build:

- **Business Ledger** — a unified financial ledger across the business. No epic
  or task yet; strategic note only.
- **Opportunity Tracking** — captured here as `TASK-011 Property Opportunities`.
- **Property Intelligence** — the whole of `EPIC-003`; treat as strategic.

### Production Intelligence — strategic concepts (not committed)

Direction is canonical (`docs/canonical/PRODUCTION_INTELLIGENCE.md`): Dovetails
models **the work first**, and pricing is one projection of it. The model's
*foundation* is **TASK-018** (the de facto PI-001), and **EPIC-008** is a
deliberate stub holding only the two next pieces scoped so far — `TASK-047 Work
Item Library` (PI-002) and `TASK-048 Confidence Engine` (PI-006). Both are
`Proposed` (not yet committed for build); they are simply the only PI ideas
promoted from concept to task.

The remaining Production Intelligence ideas are recorded here so the thinking is
not lost. They are **explicitly not committed backlog work** and earn task status
only after TASK-018 proves the model in real use:

- **PI-003 Production Profiles** — reusable production characteristics (rate,
  crew, skill, dependencies) for a work item or job shape.
- **PI-004 Pricing Intelligence Charter** — pricing as canonical business rules
  the system references, derived from the production model. First draft (from a
  pricing-evidence analysis of real estimates/invoices) exists at
  `docs/working/PRICING_INTELLIGENCE_CHARTER_DRAFT.md`; evidence at
  `docs/generated/PRICING_EVIDENCE_ANALYSIS_2026-06.md`. Still not committed work.
- **PI-005 Production Knowledge Base** — immutable business baselines (e.g.
  "Bathroom Refresh v2", travel policy, visit fee).
- **PI-007 Historical Production Learning** — completed work orders feed back to
  improve future estimates of similar work.
- **PI-008 Production Analytics** — reporting over the production model.
- **PI-009 AI Production Advisor** — assistive guidance built on the model.
- **PI-010 Estimate Explanation Engine** — human-readable "why this estimate".
- **PI-011 Production Benchmark Dashboard** — estimate-vs-actual benchmarking.
- **PI-012 Production Rule Editor** — owner-editable production/business rules.
