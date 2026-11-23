# TASK-236: One "New" button with three plain choices

Status:
In progress

Epic:
EPIC-006 Role-Based Workspaces

Phase:
cross-cutting

Severity:
Medium. Starting work has too many doors, and they disagree.

Problem:
`lib/navigation/quick-actions.ts` keeps three different shortcut lists: Desk tiles
(8: Capture, New Quote, Quick Materials, New Job, Schedule, Bills, People, New Request),
the + sheet (8: Capture, Quick job, Quick Quote, New Bill, New Job, New Request,
Material Run, Log Mileage) and the Today strip (3: Job, Receipt, Quote). A job can be
started from Quick job, New Job, the + sheet or quote approval. A quote can be started
from New Quote, Quick Quote or the quote list. The user has to know which door fits.
This breaks UX direction Rule 1 (one obvious next action) and Rule 2 (never make the
user choose a database object). Audit: UX direction section 31.

Scope:
- One "New" button on every staff screen (the existing + / FAB) with three choices:
  1. **Someone called / texted**: the intake flow; it creates the request, customer and
     property behind the scenes and offers "Send an estimate" or "Book it" at the end.
  2. **Quick job**: the existing QuickBookModal.
  3. **Receipt, photo or note**: Capture, attached to the open job when there is one.
- A short "More" row under them for the rarer starts: Log mileage, Material run,
  Invoice without a job, Full job form (`/app/jobs/new`), Full estimate form
  (`/app/estimates/new`). Quick Quote and the separate quick-lead pop-up are no longer
  offered as shortcuts; the quick-lead pop-up is deleted if nothing else uses it.
- Desk tiles and the Today strip use the same list, from one exported constant.
- Estimates, jobs and invoices are started *from* the record that leads to them
  ("Send an estimate" on a request, "Start job" on an approved estimate, "Send invoice"
  on a finished job). Labels use the TASK-235 words. The existing actions stay. Only the duplicate shortcuts go.

Out of scope:
- Removing routes. `/app/jobs/new`, `/app/estimates/quick` etc. keep working for links.
- New intake fields.

Acceptance Criteria:
- [ ] `quick-actions.ts` exports one primary list of three; the Desk, Today and + sheet all render it.
- [ ] Each of the three choices reaches a saved record in at most two screens.

Test Plan:
- Unit: `quick-actions.unit.test.ts` asserts one list and that all surfaces use it.
- E2E: each of the three choices from the phone layout ends on a saved record.
- Manual: from a phone, start each of the three choices and finish it.
Owner check after deploy (does not block the build):
- Give a non-technical person "a customer called about a leaky faucet"; they pick the right choice without help.

Build:
Runbook Track E, step E3. Needs E1 (TASK-235) Verified.

Related:
TASK-119 (quick-job lane), TASK-235.
