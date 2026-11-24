# TASK-251: Invoice lock exceptions live in one place

Status:
In Progress

Epic:
EPIC-004 Billing & Profitability

Phase:
3

Severity:
Medium. Each new exception re-pastes the whole lock function; a missed paste silently removes an earlier exception.

Problem:
The invoice immutability trigger function has been redefined in full by eight migrations (112, 146, 149, 150, 157, 192, 193, 194). Every new allowed change (reopen, document link, due date fill, client view, work summary, sponsor fields) copies the previous body and adds a branch. Audit 2026-11-24.

Scope:
- One migration that redefines the function once. The twelve columns the customer sees (number, amounts, notes, work summary, receipts flag, sponsor fields, created_by) live in `invoice_document_columns()`; `invoice_changed(old, new, cols)` tells whether any listed column changed; each exception is that list plus its own extras. Behavior identical to migration 194, except one fix below.
- Fix found while building: the old lists compared `balance_cents`, a generated column that is NULL in NEW inside a BEFORE trigger, so the 146 document-link and 157 view branches never matched. A paid invoice could never be relinked to the right job or property. `balance_cents` is left out (it is total minus deposit, both compared).
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
