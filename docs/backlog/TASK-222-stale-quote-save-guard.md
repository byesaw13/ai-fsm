# TASK-222: A stale quote page can't overwrite newer work

Status:
In Progress

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
High. It silently changes a quote's hours, materials and answers.

Problem:
The prepared-scope panel saves with no check that the quote is still the one the page loaded.
`PUT /api/v1/estimates/[id]/prepared-scope` merges the browser's copy into the stored scope by task
id (`applyScopeEdits` in `apps/web/lib/estimates/prepare-quote.ts`). Task ids are only positions
(`t1`, `t2`, …), so a copy from before the quote changed puts old numbers on the wrong tasks.

What happened on 2026-10-29 (Angela Dowd quote): the scope was changed on the server while a
tab was open. Save from that tab put the old living room hours (25–33.75 h) on the office task and the
old foyer hours on the kitchen. It also cleared all five question answers and brought back stale
itemized materials. Nothing warned the owner. Apply to quote from that tab would have rebuilt the
quote lines from the mixed scope too.

The estimate edit form's Save (`EstimateEditForm.tsx`, `PATCH /api/v1/estimates/[id]`) resends every
line item, so a stale tab there can put back old lines the same way.

Scope:
- The estimate page sends the `updated_at` it loaded with each prepared-scope Save, Apply, and edit
  form Save.
- The server compares it with the row it locks (`FOR UPDATE`). If they differ, it changes nothing and
  returns 409 with the message: "This quote changed since you opened it. Reload to see the latest
  before saving."
- After a save succeeds, the page uses the returned `updated_at` so the owner's next save works without
  a reload.
- "Itemize materials" (`prepared-scope/materials`) and "Revise" (`prepared-scope/revise`) also write the scope, so they send the same check.
- Other saves on the same page (internal notes, travel, the client/job/property card) change `updated_at`
  too. They return the new value and the page keeps it, so the owner's own save there doesn't make the
  next quote save fail.

Out of scope:
- Merging two people's edits. One owner edits a quote at a time; a reload is enough.
- Stable task ids across re-prepare. Re-prepare makes a new quote, so the old page already gets a 404.

Acceptance Criteria:
- [ ] Load the quote in two tabs. Save in tab A, then Save in tab B: tab B gets the reload message and
      the stored scope is what tab A saved.
- [ ] The same holds for Apply to quote and for the edit form's Save.
- [ ] Saving twice from one tab without reloading works.
- [ ] Saving internal notes, travel, or the client/job/property card, then saving the quote from the same
      tab, works without a reload.
- [ ] A change made outside the page (script or data fix) also makes an open tab's next Save fail.

Test Plan:
- Unit test: the version check rejects a stale `updated_at` and accepts the current one.
- Integration test: two saves with the same loaded `updated_at`; the second returns 409 and the row is
  unchanged.

Related:
TASK-179, TASK-185, TASK-187, TASK-202.
