# TASK-083: Attention Phase 2 — estimates badge, email, prune, filters

Status:
Done

Phase:
3

Problem:
Phase 1 attention (nav badges + activity bell, #569) left gaps: no estimates queue
badge, mark-read incomplete for estimate/request open, no 90-day prune, Square
webhook did not emit payment attention, list pages lacked `?attention=1` filters,
and high-signal events did not email the owner.

Business Value:
Owner sees what needs action (including sent estimates), opens records without
stale badges, gets email for paid/opened/approve-decline without partial-payment
noise, and the attention table does not grow forever.

Scope (shipped in PR #571):
- `estimatesCount` on summary + AppShell badge → `/app/estimates?attention=1`
- Mark-read on real navigation only (client POST after mount — not RSC prefetch)
- Worker 90d prune of `attention_events`
- Shared `emitInvoicePaymentAttention` for manual pay + Square webhook
- Owner email via `notification_queue` HIGH + 15m idempotency (not partial)
- `?attention=1` filters on requests/invoices/estimates lists
- Design: `docs/superpowers/specs/2026-08-04-in-app-attention-notifications-design.md`

Out of Scope:
- Multi-provider AI notifications
- Tech-facing attention
- SMS attention channel

Acceptance Criteria:
- [x] Estimates badge counts sent non-expired estimates
- [x] Opening estimate/request/invoice as owner/admin clears entity events without prefetch false clears
- [x] Square paid/partial emits attention; partial does not email
- [x] Owner email uses APP_URL; email enqueue cannot abort payment transactions
- [x] List pages honor `?attention=1` with clear filter UI
- [x] Worker prunes attention_events older than 90 days

Notes:
- Phase 1: #569; design #570.
- Codex review on #571: savepoint email isolation, client mark-read, APP_URL.
- Shipped PR #571 (`7d4cb59`). Archived in backlog truth pass 2026-08-05.
