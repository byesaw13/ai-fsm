# TASK-161: Portal self-service — request service, edit info, lifetime spend, print invoices

Status:
In progress

Phase:
2

Epic:
EPIC-003 Property Intelligence

Problem:
Customers phone the owner for things the portal could do: ask for work, fix a
phone/email, ask what they've spent, get several invoices printed.

Business Value:
Every one of these is a call the owner no longer takes, and a reason for the
customer to open the portal. Design: `docs/designs/customer-home-record-job-reports.md` (approved 2026-09-24).

Scope:
- **Text sign-in (do first):** "Text me a sign-in link" on `/portal/login`
  using the client's phone and `sendSmsViaGateway`; same magic-link expiry and
  single-use rules as email; always answers OK (no enumeration); rate-limited.
  65% of live clients have no email, so today they can never sign in.
- Request service: portal form pre-filled from the session client, property
  picker, description → `booking_requests` with client_id/property_id set.
  Rate-limited. Logged-in portal only.
- Edit info: `PATCH /api/portal/[clientToken]/profile`. Requires a portal
  session matching the token; 403 in preview. Phone + preferred contact apply
  directly. Email change: verify link to the new address (`pending_email` on
  `portal_magic_links`), applied on click, old address notified. Name/address:
  "call or text us". Owner notified + audit logged.
- Lifetime spend: SUM(paid_cents) over the client's non-draft, non-void
  invoices (deposit credit is not new money); total + year to date.
- Print invoices: checkboxes + select all → one merged PDF via `lib/pdf/load.ts`.
  Predicate `id = ANY($ids) AND client_id = session client AND account_id AND
  status <> 'draft'`; reject unless all ids match. Max 10.

Acceptance Criteria:
- [ ] A client with only a phone number can sign in by text.
- [ ] Service request lands in Requests linked to the client and property.
- [ ] Profile PATCH rejects token-without-session and preview sessions.
- [ ] Email only changes after the new address is verified.
- [ ] Lifetime spend matches invoice paid math (deposits included).
- [ ] Combined PDF rejects any id not owned by the session client.

Implementation notes (2026-09-24):
- Text sign-in shows only when `SMS_GATEWAY_URL/USERNAME/PASSWORD` are set on
  the web service (not set in production yet). Login lookups are limited to
  `BOOKING_ACCOUNT_ID` so the historical-import account never matches.
- Sign-in texts go to anyone who asked, except those who opted out
  (`CLIENT_CAN_RECEIVE_REQUESTED_SMS_SQL`). Portal opt-outs now record
  `sms_consent_source = 'portal_opt_out'`.
- Migration 197 adds `portal_magic_links.pending_email`. Login verify/confirm
  ignore those rows.
- Combined PDFs skip the photo recap (one recap can be ~10 MB).
- The Sponsored Work list uses the same picker, so realtors can print too.
