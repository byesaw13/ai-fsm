# TASK-248: Both estimate forms save through one payload builder

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
High. The edit form has already lost a customer's job and property link (TASK-232, EST-2026-0026) and drops percentage deposits (TASK-233).

Problem:
The new-estimate wizard (`estimates/new/hooks/useEstimateForm.ts`, 1,070 lines) and the edit form (`estimates/[id]/EstimateEditForm.tsx`, 1,098 lines) each keep their own state and build their own request body for `/api/v1/estimates`. Every saved field has to be got right twice; TASK-232 and TASK-233 are two cases where the edit copy got it wrong. Audit 2026-11-24.

Scope:
- `lib/estimates/save-payload.ts`: one pure function from form values to the estimate request body (client, property, job, pricing mode, deposit fields, lines, options, travel). Both forms call it.
- Fields the user did not touch are left out of an edit save, so the server keeps them (fixes TASK-232's cause for every field, not only job and property).
- Deposit type and percentage round-trip (TASK-233).
- Close TASK-232 and TASK-233 when this ships; their acceptance criteria are part of this task's.

Out of scope:
- Merging the two forms' screens or state hooks.
- Prepared-scope lines (TASK-223 owns them).

Dependencies:
TASK-223 PR 2 merged (it changes what the edit form may send for prepared quotes).

Acceptance Criteria:
- [ ] Both forms build their request body only through `save-payload.ts`.
- [ ] TASK-232 and TASK-233 acceptance criteria pass.
- [ ] Opening a saved estimate in the edit form and pressing Save changes no stored field.

Test Plan:
- Unit: payload builder round-trip (load → build → equals stored) for a manual, painting, multi-option and deposit-percentage estimate.
- E2E: edit-and-save keeps job, property and a 30% deposit.

Related:
TASK-223, TASK-232, TASK-233, TASK-234, TASK-253.
