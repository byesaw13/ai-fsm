# TASK-124: De-jargon naming — "Needs attention" + consistent "My Day"

Status:
Done

Phase:
cross-cutting

Problem:
Engine terms leak into the UI (A6). The owner's action surface is headed
"Action Queue" (engine phrasing), and the daily home is labelled **My Day** in
the nav but its page header reads **My Work** — the same screen has two names.

Business Value:
The interface reads in plain handyman language and names the daily home one way,
lowering "which screen is this?" friction. Copy-only; no routes, logic, or nav
structure change.

Scope:
- `/app/action-queue` heading "Action Queue" → **"Needs attention"**; de-jargon
  its empty-state copy ("execution actions" → plain language).
- `/app/my-work` PageHeader "My Work" → **"My Day"** to match the nav label.

Out of Scope:
- Renaming/removing **Work Orders** and Jobs→Projects (that's the nav-structure
  task, TASK-125).
- Route/URL changes (keep `/app/action-queue`, `/app/my-work` — deep links + PWA
  shortcuts survive).
- "Activity" / "Job Ledger" wording (ambiguous — not clearly jargon).

Acceptance Criteria:
- [x] The action surface reads "Needs attention"; no user-facing "Action Queue".
- [x] The daily home reads "My Day" in both nav and page header.
- [x] No route, logic, or nav-structure change; `pnpm gate:fast` green.

Notes:
A6 from the 2026-09-05 simplification plan. Pairs with TASK-125 (Jobs→Projects,
Work Orders nav). Naming polish, deliberately small. Shipped #630 (incl. the
work-order back control + start-day push wording).
