# TASK-240: A progress line on every job and customer

Status:
Done (2026-11-23, #762, verified on production)

Epic:
EPIC-006 Role-Based Workspaces

Phase:
cross-cutting

Severity:
Low. Users cannot see where a job is in the flow without reading status labels.

Problem:
The flow is the eight steps in the system map (request, customer, property, estimate,
job, visit, invoice, property history), but no staff screen shows it. A user has to infer the
stage from status chips like `sent`, `approved`, `in_progress`. UX direction Rule 1
says not to make the user infer the next step from database status labels. Audit: section 31.

Scope:
- A small line on the job and customer pages: Call → Estimate → Approved → Working → Invoiced → Paid.
- The current step is lit; done steps are ticked and tap through to that record.
- Built from existing records (request, estimate, job, visits, invoice, payments). No new columns.

Out of scope:
- An editable pipeline or drag-to-change-status.

Acceptance Criteria:
- [ ] The job page and customer page show the line, with the current step lit.
- [ ] Tapping a finished step opens that record.
- [ ] Jobs with no estimate (quick jobs) skip the Estimate and Approved steps cleanly.

Test Plan:
- Unit: step derivation for each combination of request/estimate/job/invoice/payment state.
- E2E: a quick job and a quoted job each show the right steps.

Build:
Runbook Track E, step E6. Needs E5 Verified (it sits in the new job page header).

Related:
TASK-239, TASK-176 (this map).
