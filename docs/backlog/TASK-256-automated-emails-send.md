# TASK-256: Automated emails actually send

Status:
Done

Epic:
EPIC-005 Platform & Delivery

Phase:
cross-cutting

Severity:
High. No automated email has ever reached a customer or the owner.

Decision (owner, 2026-11-25): fix it. Send through the web app's mailer; clean up first so nothing goes out twice or months late.

Problem:
The worker sends the email in `notification_queue`, but it runs only on the `internal` Docker network (`internal: true` in `infra/compose.garonhome.yml`) and cannot resolve `smtp.gmail.com`. All 92 queued emails from 2026-05-16 to 2026-11-23 failed with `getaddrinfo EAI_AGAIN smtp.gmail.com`. Booking confirmations, visit reminders, invoice and estimate follow-ups, review requests, seasonal and re-engagement emails, and the owner's own "invoice paid" / "estimate approved" alerts were all lost. The 14 automations show as enabled and run every 30 minutes, and nothing tells the owner they fail. Web Push already moved its sending to the web tier for the same reason (TASK-118). Second audit 2026-11-25.

Scope (as built):
1. Migration 221: one automation per type per account (unique index). Removes `membership_renewal_nudge` (no handler; memberships paused) and the 7-day `estimate_followup` row. Correction to the audit: the two `estimate_followup` rows were a designed 3-day + 7-day sequence (migration 098), not a duplicate. They share the idempotency key `estimate_followup:<estimate id>`, so the 7-day one never sent. Owner 2026-11-25: keep only the 3-day reminder.
2. The 92 failed queue rows need no change: `failed` is final and the worker only picks up `pending`.
3. `POST /api/internal/email` (web tier, `x-api-key` = `LOCATION_INTERNAL_KEY`, the existing internal-route pattern) sends through `lib/email/mailer.ts`. The worker's `mailer.ts` now hands each email to it (`WEB_INTERNAL_URL`, default `http://web:3000`) instead of using SMTP. Dispatch, retries, quiet hours and cooldowns are unchanged. `nodemailer` is removed from the worker.
4. A queued email that fails its last attempt adds one `notification.failed` attention item per day ("Automatic emails are failing", linking to Automations).

Out of scope:
- Giving the worker internet access (it stays isolated by design).
- Changing what any email says, or which automations are on.
- Customer SMS (the worker sends none today).

Acceptance Criteria:
- [x] On production, one automation email (e.g. the owner's "invoice paid" alert) is delivered and its queue row is `sent`.
- [x] `automations` has one row per type per account, enforced by the index.
- [x] No failed row from before the deploy is sent.
- [x] A forced send failure shows up for the owner as an attention item.
- [x] The worker no longer contains a mailer.

Test Plan:
- Integration: the dispatch route sends a queued row through a stubbed transport and marks it sent; a failure on the last attempt creates the attention item; the unique index refuses a second automation of the same type.
- Deploy: backup first (migration); after deploy, trigger one owner alert and confirm the email arrived.

Related:
TASK-118 (Web Push moved sends to the web tier), TASK-182 (deposit request email).
