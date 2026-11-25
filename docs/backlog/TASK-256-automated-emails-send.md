# TASK-256: Automated emails actually send

Status:
Proposed

Epic:
EPIC-005 Platform & Delivery

Phase:
cross-cutting

Severity:
High. No automated email has ever reached a customer or the owner.

Decision (owner, 2026-11-25): fix it. Send through the web app's mailer; clean up first so nothing goes out twice or months late.

Problem:
The worker sends the email in `notification_queue`, but it runs only on the `internal` Docker network (`internal: true` in `infra/compose.garonhome.yml`) and cannot resolve `smtp.gmail.com`. All 92 queued emails from 2026-05-16 to 2026-11-23 failed with `getaddrinfo EAI_AGAIN smtp.gmail.com`. Booking confirmations, visit reminders, invoice and estimate follow-ups, review requests, seasonal and re-engagement emails, and the owner's own "invoice paid" / "estimate approved" alerts were all lost. The 14 automations show as enabled and run every 30 minutes, and nothing tells the owner they fail. Web Push already moved its sending to the web tier for the same reason (TASK-118). Second audit 2026-11-25.

Scope (in this order):
1. Cleanup, one guarded data migration:
   - delete one of the two `estimate_followup` automation rows (keep the older; otherwise every estimate gets two follow-ups) and add a unique index on `automations (account_id, type)`;
   - delete the `membership_renewal_nudge` row (no handler; memberships are hidden; last ran 2026-06-07);
   - mark the 92 failed `notification_queue` rows `cancelled` so none is resent months late.
2. The web tier sends queued email. Lazy shape: an internal route (`/api/internal/notifications/dispatch`, internal-token auth like the other internal routes) that runs the existing dispatch logic with `lib/email/mailer.ts`; the worker calls it on its interval instead of sending itself. Pick another shape only if it is smaller, and say why in the PR.
3. Delete what this replaces: `services/worker/src/mailer.ts` and the worker's `nodemailer` dependency.
4. A send that fails is visible to the owner: an attention item ("Emails are failing: <reason>") when a queued email fails its last attempt.

Out of scope:
- Giving the worker internet access (it stays isolated by design).
- Changing what any email says, or which automations are on.
- Customer SMS (the worker sends none today).

Acceptance Criteria:
- [ ] On production, one automation email (e.g. the owner's "invoice paid" alert) is delivered and its queue row is `sent`.
- [ ] `automations` has one row per type per account, enforced by the index.
- [ ] No queue row older than the deploy is sent.
- [ ] A forced send failure shows up for the owner as an attention item.
- [ ] The worker no longer contains a mailer.

Test Plan:
- Integration: the dispatch route sends a queued row through a stubbed transport and marks it sent; a failure on the last attempt creates the attention item; the unique index refuses a second automation of the same type.
- Deploy: backup first (migration); after deploy, trigger one owner alert and confirm the email arrived.

Related:
TASK-118 (Web Push moved sends to the web tier), TASK-182 (deposit request email).
