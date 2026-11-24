# TASK-242: A job is one page with tabs

Status:
Proposed

Epic:
EPIC-006 Role-Based Workspaces

Phase:
cross-cutting

Severity:
High. Following one job means moving between job, estimate, invoice and visit pages.

Problem:
After TASK-239 the job page leads with one next step and groups panels into Work, Money
and History. The estimate and invoice still live on their own pages: the job links out
to `/app/estimates/[id]`, `/app/estimates/new`, `/app/invoices/new` and
`/app/invoices/[id]`. Recording a payment or booking a visit also leaves the job. The
prototype keeps the whole job on one page (UX direction section 32).

Scope:
- Job page tabs: **Estimate**, **Visits**, **Invoice & payments**, **Costs**, **Activity**.
  The next-step bar and progress line from TASK-239/240 stay above the tabs.
- Estimate tab: the current estimate's lines edited in place (same API and rules as the
  estimate page, TASK-222 stale-save guard, prepared-scope rules from TASK-223), with
  totals, deposit and "Customer copy".
- Invoice tab: invoice lines, status, payments list, "Record payment" dialog.
- Visits tab: visit list with "Book visit" dialog.
- Quick actions open as dialogs and return to the same tab.
- The separate estimate and invoice pages keep working (links, portal, history); the job
  tabs are the normal path.
- Opening a job picks the tab that matches its stage.

Out of scope:
- Changing estimate or invoice rules, numbering or the portal.
- Removing the old pages.

Acceptance Criteria:
- [ ] From a new job to paid, the owner never has to leave the job page.
- [ ] Editing a line on the Estimate tab and on the estimate page gives the same stored result.
- [ ] Record payment and Book visit work from dialogs and keep the tab.
- [ ] Phone layout: tabs scroll, the next-step button stays reachable.

Test Plan:
- E2E: job → add estimate lines on the tab → send → approve → book visit → invoice →
  record payment, without leaving `/app/jobs/[id]`.
- Integration: tab edits go through the existing estimate PATCH with `updated_at`.
- Side-by-side check against the prototype job page on phone and laptop.

Related:
UX direction section 32. TASK-239, TASK-240, TASK-222, TASK-223, TASK-234 (revise and resend).
