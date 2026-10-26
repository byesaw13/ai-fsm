# TASK-211: Duplicate-safe purchase imports (history and book modes)

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-209

Depends on:
TASK-210

Scope:
One import path through `apps/web/lib/expenses/import/` with two modes (price history only; book purchases); Store Number parsing; transaction identity = supplier family + store + transaction ID; transaction-scoped keys with occurrence numbers; persistent review records in both modes (pending count and value, safe re-import, atomic confirmation, dismiss with reason and reopen); only full transaction identity auto-links; sale flag kept; receipt parse revisions and signed return/discount lines; reject report; retire `/api/v1/materials/import` and `hd-import.ts`. Design section 3.

Acceptance Criteria:
- [ ] Design acceptance criteria 1, 1a to 1f, 2, 2a, 2b and 3 pass (re-import checks at a fixed evaluation date).
- [ ] Regression: `duplicate-match.unit.test.ts` updated; store + date + amount no longer auto-links.

Design:
`docs/working/estimating-assistant-phase3.md` (owner decisions D1 to D11, eng decisions E1 to E10, correction passes of 2026-10-26).

Effort:
4 d / 4 h
