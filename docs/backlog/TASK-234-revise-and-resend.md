# TASK-234: Revise and resend a sent quote

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
Medium. Every negotiation after a quote goes out needs hand-written database changes.

Problem:
Once a quote is sent, its price and scope are locked. `updateEstimateById`
(`apps/web/lib/estimates/repository.ts`) allows only internal notes, the
`enforce_estimate_immutability` trigger blocks price and notes changes, and
`estimateTransitions` has no way back from `sent` to `draft`. The `parent_estimate_id`
and `revision` columns exist, but nothing in the app creates a revision.

Found 2026-11-22 on Sagar (EST-2026-0030, $900, sent). He offered $700, and the owner
agreed to $700 with the basement stairwell removed. The owner could not change the quote
in the app. It was done by hand in the database: a copy as revision 2 (EST-2026-0031)
with the section removed, the scope text renumbered and the lines repriced; the reply
texted with the new link and logged; the new quote marked sent; the old one expired so
the $900 version could not be approved.

Scope:
- A "Revise" action on a sent quote. It copies the quote, its lines and options into a
  new draft with `parent_estimate_id` set and `revision` + 1. The copy gets a new number
  and share link and a fresh expiry; approval, signature and review fields start empty.
- The draft opens in the normal edit form, so lines, scope text, hours and deposit can change.
- Sending the revision uses the existing Send action (email, or text when there is no email).
  In the same transaction the parent quote is set to `expired`, with a note in its internal
  notes saying which quote replaced it.
- The parent's customer page says the quote was replaced and links to the new one.
- Quote detail shows "Revision 2 of EST-…" and links between versions.
- Prepared quotes copy `prepared_scope` too, so the revision can be re-prepared (TASK-223 rules).

Out of scope:
- Editing a sent quote in place. A customer who already has the link keeps seeing what was sent.
- Revising approved quotes. Those go through change orders.
- A side-by-side diff of revisions.

Acceptance Criteria:
- [ ] On a sent quote, Revise creates a draft revision with the same client, property, job,
      lines, scope text, assumptions and deposit terms, and opens it for editing.
- [ ] The original stays `sent`, and its link keeps working, until the revision is sent.
- [ ] Sending the revision expires the original, and the original can no longer be approved.
- [ ] The original's customer page points to the revision.
- [ ] Discarding an unsent revision leaves the original untouched.
- [ ] No database trigger is loosened. Sent quotes stay immutable.

Test Plan:
- Integration test: revise → edit lines → send; parent expired, child sent, totals right,
  `parent_estimate_id` and `revision` set.
- Integration test: approving the parent after the child is sent is refused.
- Integration test: deleting a draft revision leaves the parent `sent`.
- E2E: Revise from the quote page, change a line, send, open both customer links.

Related:
TASK-222 (stale quote save guard), TASK-223 (one authoritative estimate draft),
TASK-230 (deposit to book).
