# TASK-182: On approval, request the deposit and start scheduling

Status:
Done (2026-10-25)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
Approval creates the deposit invoice as a draft (`lib/estimates/approve.ts`).
The Square payment-link route rejects draft invoices
(`invoices/[id]/square-link`), so the existing actions do not connect on their
own. The invoice send route emails the customer before it marks the invoice
sent, so a later failure can leave a draft even though the message arrived.
Nothing starts scheduling.

Business Value:
The customer gets the right deposit request right after saying yes, and the
job is waiting for a date instead of being forgotten.

Scope:
- On final customer approval (status `approved`, any route, option chosen per
  TASK-181) with a deposit required: move the deposit invoice out of draft,
  create its Square payment link, then send it. The sequence is explicit and
  tested, not assumed.
- Record each delivery attempt (channel, time, outcome: delivered, failed
  before contact, or unknown). Only "failed before contact" may be retried
  automatically. An unknown outcome (timeout, no provider response, crash
  after contact) is never re-sent automatically; it waits for the owner to
  check and choose to resend. "Still draft" does not by itself mean nothing
  went out.
- Approval arriving twice sends nothing new.
- Create one "Schedule this job" action item on the job. Its state follows
  the estimate's existing `deposit_due_trigger`, which keeps its meaning:
  - `on_acceptance` or `before_scheduling`: "waiting on deposit"; it becomes
    "ready to book" only when the deposit invoice is fully paid.
  - `before_material_order`: "ready to book" at once, showing the deposit as
    due before materials are ordered.
  - `custom`: "ready to book" at once, showing the deposit as due per the
    written terms.
  - No deposit required: "ready to book" at once.
- "Fully paid" means the deposit invoice is paid in full, not that a payment
  notification arrived. A repeated webhook creates nothing new.
- Requesting the deposit is separate from blocking the booking: the request
  always goes out at approval; only the trigger decides whether booking
  waits.
- A failed send leaves the deposit visibly not delivered on the item, with a
  retry.
- An account setting turns the automatic request on or off; default on.

Out of Scope:
- Automatic booking of dates. A separate signed work agreement.

Acceptance Criteria:
- [x] Approval with a deposit sends one request with a working payment link.
- [x] With `on_acceptance` or `before_scheduling`, the item starts "waiting on
      deposit" and moves to "ready to book" only on full payment; a partial
      payment does not move it; a repeated webhook adds nothing.
- [x] With `before_material_order` or `custom`, the item starts "ready to
      book" and shows the deposit as still due under that rule.
- [x] Approval with no deposit creates a ready-to-book item and sends nothing.
- [x] Nothing is sent before approval; a second approval sends nothing.
- [x] A failure before contact is recorded, visible and retryable.
- [x] A delivered or unknown outcome is never re-sent automatically; an
      unknown outcome is shown to the owner as "check before resending" and
      only an explicit owner action resends.

Notes:
Depends on TASK-181.

Shipped: on final approval (portal, email link, owner Mark as Approved,
including after an SMS yes), createApprovalArtifacts opens one "Schedule this
job" action item whose wording follows deposit_due_trigger; after the approval
commits, requestDepositAfterApproval sends the draft deposit invoice through
the shared send path (lib/invoices/send.ts, moved unchanged out of the send
route). The customer's portal invoice page creates the Square checkout link on
demand once the invoice is sent, so no link is made while it is a draft.
Every automatic send is recorded in invoice_delivery_attempts (migration 206):
pending is committed before contact; delivered/failed after; an error during
the send is 'unknown'. Only a failed (not contacted) attempt allows another
automatic send; delivered, pending or unknown never re-send. Failures and
unknowns are written onto the schedule item. A trigger moves the item to
"deposit received, ready to book" when the deposit invoice becomes paid, from
any payment path; partial payments do not. Settings → Company has the on/off
switch (default on).

