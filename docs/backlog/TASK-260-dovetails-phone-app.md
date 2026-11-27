# TASK-260: Dovetails Phone — our own Android app for customer calls and texts

Status:
In Progress

Epic:
EPIC-005 Platform & Delivery

Phase:
Phase 1 exception (ROADMAP "TASK-260 Dovetails Phone", authorized 2026-11-27)

Severity:
Medium. Service texts (on the way, reminders, quote and invoice links) and
customer replies go through the third-party SMS Gateway app on the owner's
Android phone. The owner reports it is inconsistent. Calls from customers are
not recorded at all, so nobody can see who called, who was missed, or whether
the call was returned.

Decision (owner, 2026-11-27, in session):

> "Right now, we have the SIM on my phone, my Android phone, and it's linked to
> that gateway app, but it seems very inconsistent. I'm looking to build
> something of its own that can converse with the AI FSM platform. I don't need
> to record phone calls [...] I just more want the phone call numbers that come
> in that relate to other customers in the system, or texts that come in in the
> same way (so that we can track that stuff better and keep it within a CRM
> aspect, so that we have better control over when and how calls are recorded,
> received, and returned)."

Problem:
- Outbound texts depend on sms-gate.app's cloud relay waking the phone. When
  that relay or the app sleeps, texts silently wait or fail.
- Inbound texts depend on the same app's webhook reaching the server.
- Calls never reach the FSM. A missed call from a customer leaves no trace.
- Texts the owner types in the phone's own Messages app never reach the
  customer's record.

Scope:
- `apps/android`: a sideloaded Kotlin app (not Play Store; Play forbids call
  log and SMS access for this use). It holds the business SIM's traffic:
  - Outbound: pulls queued texts from the server, sends them on the chosen SIM,
    reports sent / delivered / failed. A text is never sent twice for one
    outbox id.
  - Inbound texts: saved locally the moment they arrive, then uploaded with
    retries. A periodic rescan of the inbox catches anything missed while the
    app was stopped.
  - Texts typed in the phone's Messages app and calls (number, direction,
    answered / missed / voicemail, duration, time) are read from the system
    logs on a checkpoint and uploaded. No audio is recorded.
  - Foreground service, starts on boot, asks to be excluded from battery
    optimization, checks in every minute.
  - Shows the FSM's notification for each customer text, with a one-tap
    "Send suggested reply".
- Server (`/api/internal/phone/*`, key `PHONE_APP_KEY`):
  - `phone_outbox` table: the queue the phone pulls. `SMS_TRANSPORT=phone_app`
    sends every existing text through it (one switch in `lib/sms/gateway.ts`).
    Default stays `gateway`, so nothing changes until the owner flips it.
  - `phone_devices` table: the phone's last check-in, used by the existing
    "Business phone is offline" alert.
  - Calls and the owner's own texts are kept only when the number matches a
    customer. Personal calls and texts are dropped on the server and never
    stored.
  - `communications_log` gains `duration_seconds` and the call outcomes
    `answered` and `missed`.
  - A missed call or voicemail from a customer raises an attention event and a
    push. Needs Attention lists "Call back" for each customer whose missed call
    has no later call or text from us (last 14 days).
  - The customer page timeline names calls: "Missed call", "Voicemail",
    "Customer called (4 min)", "You called (2 min)", "You called — no answer".

Out of scope:
- Call recording or transcription.
- Replacing the web app on the phone. The installed web app stays the place to
  read and act on the record.
- iPhone. iOS gives apps no access to the call log or SMS.
- A conversation inbox page. The customer timeline and Needs Attention cover it
  until the owner asks for more.
- Unknown numbers becoming leads from calls. Inbound texts from unknown numbers
  keep the existing AI "is this business?" path.

Acceptance Criteria:
- [x] Migration 223 adds `phone_outbox`, `phone_devices`, the two call
      outcomes and `duration_seconds`, with a rollback block.
- [x] With `SMS_TRANSPORT=phone_app`, every send site queues to `phone_outbox`
      and the phone's report updates the logged text's outcome.
- [x] A claimed text the phone never reports is offered again after 5 minutes;
      texts older than 2 hours are failed, not sent late.
- [x] A call from a customer's number lands on their timeline; a call from an
      unknown number is not stored.
- [x] A missed customer call raises one attention event and shows in "Call
      back" until we call or text them.
- [x] Unit tests for the server routes and the app's pure logic.
- [x] The APK builds (`./gradlew assembleDebug`).
- [ ] On the owner's phone: install, pair, grant permissions; an on-the-way
      text sends; a test call and a test text from a customer number show on
      that customer's page; a missed call shows in Call back.
- [ ] Owner flips `SMS_TRANSPORT=phone_app` in production and turns off the
      SMS Gateway app's webhooks.

Test Plan:
- Unit: `apps/web/app/api/internal/phone/__tests__`, `apps/web/lib/phone-app`
  tests, `apps/android` JVM tests (`./gradlew test`).
- Manual: the device checklist above. Setup steps:
  `docs/working/dovetails-phone-app.md`.

Build:
Owner request 2026-11-27. Not on a runbook track.
