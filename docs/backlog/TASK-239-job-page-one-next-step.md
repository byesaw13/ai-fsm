# TASK-239: The job page leads with one next step

Status:
In progress

Epic:
EPIC-006 Role-Based Workspaces

Phase:
cross-cutting

Severity:
High. The job page is the screen used most in the driveway, and it fails the
three-second test.

Problem:
`app/app/jobs/[id]/page.tsx` is about 2,000 lines with about 22 panels (tasks, work
orders, materials, vendor coordination, asset links, intake, deposit, progress billing,
change orders, closeout coach, what-next, ledger, photos, notes, …) and about 36 buttons
and links. Several panels give equal weight to Edit, Change Status, Add Visit, Invoice,
Collect Deposit. Labels use the TASK-235 words. `ProjectWhatNext.tsx` already works out a next step, but it is one
panel among many. This breaks UX direction Rule 1, Rule 8 (progressive disclosure) and
Rule 9 (driveway test). Audit: section 31; job screen direction in section 13.

Scope:
- Top of the page: customer, property, one plain status sentence ("Waiting on the customer
  to approve the estimate"), and **one large primary button** driven by the existing
  what-next logic.
- Below it, three closed-by-default sections: **Work** (visits, tasks, materials,
  photos), **Money** (estimate, deposit, invoices, ledger), **History** (notes, changes).
- Admin-only panels (work orders, vendor coordination, asset links) go inside those
  sections, collapsed.
- Delete or retire panels this replaces in the same change (doctrine Rule 4).
- Not in this task: the same pattern on the Estimate, Visit and Customer pages. Write
  those as new tasks after this one has been used for two weeks.

Out of scope:
- Changing job status logic or what-next rules.
- New panels.

Acceptance Criteria:
- [ ] On a phone, the first screen of a job shows the status sentence and exactly one primary button.
- [ ] Every action available before is still available inside a section.

Test Plan:
- Unit: what-next → primary button mapping for every job state.
- E2E: open a job in each state; primary button matches the expected action.
- Manual: open five jobs in different states on a phone; the button matches the next step.
Owner check after deploy (does not block the build):
- A non-technical tester names the next step on five sample jobs within three seconds each.

Build:
Runbook Track E, step E5, in two PRs. PR 1: the top block (status sentence and primary
button). PR 2: the Work / Money / History sections and retiring the panels they replace.
Needs E1 Verified. The builder writes the status sentence for each job state and lists
them in the PR.

Related:
TASK-240, ProjectWhatNext / ProjectCloseoutCoach, TASK-133.
