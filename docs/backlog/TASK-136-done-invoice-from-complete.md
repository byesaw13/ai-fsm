# TASK-136: Done — complete project and draft the invoice

Status:
Proposed

Phase:
3

Problem:
Field Complete never completes the project or drafts the invoice. Owner
“Complete & Invoice” does, but labor is always titled “Labor” and materials are
SKU-itemized. Dump fees mix into materials.

Business Value:
Bonnie-style jobs leave the driveway already billed (or held as a real draft).
Landing-style jobs, when finally done, get one labor / materials / dumping
invoice with the work named.

Scope:
- Complete + **done** (after required “what did you do today” on **this** visit):
  1. Save `tech_notes`
  2. Complete this visit (existing transition)
  3. Complete the work order if criteria allow
  4. `POST` job `completed` so `createDraftFinalInvoiceForJob` runs
  5. Show the draft: Send or Hold
- Labor: **one** line. Description = this job’s completed-visit `tech_notes`
  stacked (this day last or chronological — pick chronological, oldest first).
  Fallback: job title. Qty = tracked `job_work` at `labor_billing_cents_per_hour`.
  **Do not change rates.**
- Materials: **one** rollup of job expenses with `category = 'materials'`.
  Ignore `expense_line_items` on this path. No handling fee
  (`apply_material_handling = false`).
- Dumping: **one** separate line if any job expense matches dump/transfer/
  disposal/debris in vendor or notes (include `category = 'other'`).
- Idempotent: existing non-cancelled final/standard invoice → do not create a
  second (already true in `createDraftFinalInvoiceForJob`).
- Hold = leave draft. Send = existing invoice send.

Out of Scope:
- Coming-back scheduling (TASK-135)
- Night leftovers (TASK-138)
- Progress/deposit invoices (TASK-120)
- Editing rates in this wizard

Acceptance Criteria:
- [ ] Done on a no-estimate T&M/quick job produces one draft invoice on that job
- [ ] Labor description contains today’s `tech_notes`, not only the word “Labor”
- [ ] Materials is a single line equal to the sum of materials expenses on the job
- [ ] A Derry transfer-station expense is a “Dumping fees” line, not inside materials
- [ ] No material handling line is added
- [ ] Job status is `completed`; visit is `completed`
- [ ] Second Complete/done does not create a second invoice
- [ ] Tests: rollup vs SKU fixtures; dump heuristic; notes in labor copy;
      idempotent draft

Notes:
Hook: `apps/web/lib/invoices/final-invoice.ts` and `job-expenses.ts`.
Do not break estimate-flat-rate jobs that still copy estimate lines — this
closeout path is for T&M / no-estimate / `hourly_internal` (quick-book default).
Quoted flat jobs: still owner Complete & Invoice unless they also choose Done;
then keep estimate lines (do not silently switch those to T&M actuals).
