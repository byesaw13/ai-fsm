# Dovetails FSM — Product Backlog

This is the **active product backlog** for Dovetails FSM. It exists so future
work is tracked intentionally in the repo instead of being scattered across
chat sessions.

This backlog was created as an initial pass from recent planning discussions.
The tasks here did **not** previously exist as a tracked list — this is the
first time they are written down in one place.

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
