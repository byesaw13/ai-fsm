# TASK-243: Today reads as a list of sentences

Status:
Proposed

Epic:
EPIC-006 Role-Based Workspaces

Phase:
cross-cutting

Severity:
Medium. Today should answer "what do I do now" at a glance.

Problem:
The prototype's Today shows one prioritized list where each row is a sentence with the
reason and the amount ("Follow up on estimate — $900 sent to Sagar 5 days ago"), and
tapping it opens the place to act. The app's Today (`/app/my-work`, Needs Attention and
dashboard widgets) spreads the same facts across several panels and labels (UX direction
section 4, section 6, section 32).

Scope:
- One list at the top of Today, highest priority first: new requests, overdue invoices,
  draft invoices, deposits owed, quotes waiting past the follow-up days, ready to
  schedule, jobs with no next visit, unanswered texts, receipts to review.
- Each row: icon, one sentence with who and how much, one line of why, tap opens the job,
  person or page to act.
- Uses existing Needs Attention sources; no new tables.
- Today's visits stay below the list. Role rules unchanged (tech sees their day only).

Out of scope:
- New attention rules beyond what Needs Attention already knows, except unanswered texts
  (inbound with no later outbound, from `communications_log`).

Acceptance Criteria:
- [ ] Every row is a full sentence naming the customer and the amount where there is one.
- [ ] Tapping a row lands on the screen where the action is done.
- [ ] An unanswered customer text appears as a row.
- [ ] Empty state says the day is clear.

Test Plan:
- Unit: sentence builder for each row type.
- E2E: seed a sent quote older than the follow-up days and an inbound text; both rows show and open the right page.
- Side-by-side check against the prototype Today.

Related:
UX direction sections 4, 6, 32. TASK-238.
