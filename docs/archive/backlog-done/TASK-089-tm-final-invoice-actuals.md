# TASK-089: T&M final invoice from actuals + mobile deliver

Status:
Done

Phase:
3

Problem:
Final invoices for time-and-materials jobs started at the estimate budget total
instead of tracked labor and materials logged in the app. On mobile, send/share
actions sat in the sidebar below line items, so the owner could not quickly
deliver an invoice from the field.

Business Value:
Honest T&M billing (actual hours × rate + receipts) and a one-thumb path to send
or share the client link from a phone.

Scope:
- `createDraftFinalInvoiceForJob` uses actuals when `pricing_mode = hourly_internal`.
- Manual `/app/invoices/new?job_id=` prefills T&M actuals, not estimate budget.
- Sticky mobile deliver bar (send / share link / PDF) on invoice detail.
- FAB quick action: New Invoice.

Acceptance Criteria:
- [x] Completing a T&M project drafts a final invoice from tracked time + job materials, not estimate line budgets.
- [x] Create-invoice prefill for a T&M job uses the same actuals.
- [x] Owner on mobile can send or share the invoice without scrolling the sidebar.
- [x] Unit coverage for T&M path in final-invoice tests.
- [x] Lift/equipment expenses (tag or lift heuristic) transfer onto the final invoice.
- [x] Complete & Invoice on the project page opens the draft with deliver actions ready.

Notes:
Shipped PR #565 (`81b8e03`). **ID history:** originally filed as TASK-082 in
EPIC-004, colliding with buy-list TASK-082 in EPIC-002. Renumbered to TASK-089
in backlog truth pass 2026-08-05 (buy list keeps 082).
