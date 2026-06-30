# TASK-014: Invoice Generation from Visits

Status:
Done

Problem:
Turning completed work into an invoice was manual and disconnected from the visit
that produced it.

Business Value:
Faster, more accurate billing that stays tied to the work actually completed.

Scope:
- Generate an invoice (draft) from completed visit work.
- Keep the invoice connected to the originating job/visit.

Out of Scope:
- Automatic sending/collection.

Acceptance Criteria:
- [x] A completed visit can produce an invoice draft.
- [x] The invoice is linked to its job/visit.

Notes:
Shipped. Billing logic in `apps/web/lib/invoices/billing.ts`; visit-completion →
invoice-draft bridge is part of the workflow automation pass.
