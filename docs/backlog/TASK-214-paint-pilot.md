# TASK-214: Paint pilot: one paint rule, real paint prices

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-209

Depends on:
TASK-212, TASK-213, TASK-190 (PR #720)

Scope:
One `paintQuantity` rule (per-surface coverage, grouped by exact product/tint/sheen/application, waste once with explicit 0% allowed, round once per group); primer never uses the wall-paint default; Prepare Quote prices paint from the chosen product and ledger, "Choose a paint product" otherwise; owner-chosen packages; formula authority over generator quantities; stored formula inputs with recalculation and owner overrides; logging of manual actions for the pilot criteria. Design section 7.

Acceptance Criteria:
- [ ] Design acceptance criteria 8, 9, 9a and 9b pass.
- [ ] Engine results that change are listed in the PR.
- [ ] Manual actions (overrides tagged correction or preference, links, mapping confirmations, package sizes, coverage edits) are logged per quote.

Design:
`docs/working/estimating-assistant-phase3.md` (owner decisions D1 to D11, eng decisions E1 to E10, correction passes of 2026-10-26).

Effort:
3.5 d / 0.5 d
