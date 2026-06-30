# TASK-015: Payment Tracking

Status:
Done

Problem:
Invoice payment state needed to be tracked so outstanding balances and paid work
are clear.

Business Value:
Accurate receivables: know what is paid, partial, or overdue at a glance.

Scope:
- Record payments against invoices and derive paid/partial/overdue state.

Out of Scope:
- Payment-processor integration strategy.

Acceptance Criteria:
- [x] Payments can be recorded against an invoice.
- [x] Invoice status reflects paid / partial / overdue.

Notes:
Shipped. `apps/web/lib/invoices/payments.ts` with payment tests.
