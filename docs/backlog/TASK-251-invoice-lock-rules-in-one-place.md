# TASK-251: Invoice lock exceptions live in one place

Status:
Proposed

Epic:
EPIC-004 Billing & Profitability

Phase:
3

Severity:
Medium. Each new exception re-pastes the whole lock function; a missed paste silently removes an earlier exception.

Problem:
The invoice immutability trigger function has been redefined in full by eight migrations (112, 146, 149, 150, 157, 192, 193, 194). Every new allowed change (reopen, document link, due date fill, client view, work summary, sponsor fields) copies the previous body and adds a branch. Audit 2026-11-24.

Scope:
- One migration that redefines the function once, with each allowed change as a small named SQL function (`invoice_change_allowed_<name>(old, new) → boolean`) that the trigger ORs together. Behavior identical to migration 194.
- A comment at the top of the trigger: "To allow a new change, add one function and one line here; do not re-paste."

Out of scope:
- Changing which changes are allowed.

Acceptance Criteria:
- [ ] Every existing integration test for invoice immutability passes unchanged.
- [ ] The next exception can be added without copying the existing ones.

Test Plan:
- Integration: the existing immutability suite, plus one case per named exception.
- Deploy: backup first (migration).

Related:
TASK-154, TASK-157, TASK-158, TASK-246.
