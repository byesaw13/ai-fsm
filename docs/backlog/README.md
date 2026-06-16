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
- `done/` — completed tasks, moved out of the active epics.

Each epic file lists its **active** tasks in full and links to its **completed**
tasks in `done/`.

## Task index

Next available ID: **TASK-019**.

| ID | Title | Epic | Status |
| --- | --- | --- | --- |
| TASK-001 | Vehicle Mileage Sessions | 001 | Done |
| TASK-002 | Vehicle Session Recovery | 001 | Done |
| TASK-003 | Wrong Vehicle Correction | 001 | Done |
| TASK-004 | Daily Operations Log | 001 | In Progress |
| TASK-005 | Activity Tracking | 001 | Done |
| TASK-006 | Assessment → Materials Generator Context | 002 | Done |
| TASK-007 | Assessment → Estimate Context | 002 | In Progress |
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
