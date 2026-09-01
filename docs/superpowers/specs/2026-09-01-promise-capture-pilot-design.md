# Promise Capture Pilot Design

Status: Approved baseline
Date: 2026-09-01
Owner: Nick, Dovetails Home Services
Backlog: TASK-115 (EPIC-005, Phase 1 exception)

## Problem

A promise made on a jobsite or phone call may not be available when it is needed. The cost appears later as a dropped follow-up, a missed material, or a customer who expected an answer.

This pilot tests one business outcome:

A customer promise captured on Tuesday should still exist in the correct AI-FSM workflow on Thursday without Nick maintaining a second list.

It does not build a second operating system, task manager, morning ritual, coaching relationship, or goal system.

## Fit With AI-FSM

AI-FSM already owns the operating day:

- `/app` is the Daily Command Center and existing WhatNext priority surface.
- `/app/my-work` is the field-focused My Day surface.
- `/app/day-review` owns AI Day Draft, review, and day close.
- Action Queue and Attention surface operational work derived from authoritative records.

The pilot extends those surfaces. It must not add a separate briefing, review, inbox, dashboard, or task list.

Confirmed work has one operational home in AI-FSM. The capture record retains original evidence and interpretation history but does not become a parallel source of task status.

## Protected Principles

- Prefer recognition over unaided recall.
- Keep the immutable original capture.
- Do not create a confirmed fact or commitment without Nick's confirmation.
- Do not promote uncertain language into a firm commitment.
- Add captured promises to the existing Action Queue as one counted bucket; do not replace its priority model.
- Do not punish missed or dismissed prompts.
- Do not send customer messages autonomously.
- Keep one authoritative operational home for confirmed work.
- Make capture easier than remembering and reconstructing the information later.
- When confidence is low, resurface the original instead of creating classification work.

For the pilot, this specification, source control, and tests protect these rules.

## Pilot Loop

1. Zero-context voice capture, with an optional photo stored as an uninterpreted blob.
2. Immutable original and transcript.
3. Conservative extraction of firm commitments only.
4. One-at-a-time confirmation inside the existing Day Review.
5. Write-back to one `action_items` row on a supported entity.
6. One open-customer-promises bucket on the existing `/app` Action Queue and WhatNext selection.
7. One-tap resolve on the open promise rows. Completion is `action_items.resolved_at`.

## Capture

The current PWA has no manifest shortcuts, Web Share Target, or in-app MediaRecorder. Lock-screen tiles and Quick Settings require native Android and are not assumed.

Test routes in order, stop when the truck-and-dirty-hands case is acceptable:

1. Manifest shortcut to `/app/capture`, microphone starts without fields.
2. Web Share Target only if the shortcut misses reachability.
3. TWA / minimal native activity only if both web routes fail.

Invariant: recording starts without selecting a customer, project, visit, category, or form.

Capture requires an already-signed-in PWA session (7-day cookie). An expired session is a group-3 reachability miss. After login, return to `/app/capture` and start the mic. Allowlist `next` to `/app/capture` only.

Hold the audio blob on the device until the POST is acknowledged. Server-side processing retry is not a substitute for a failed upload.

Owner and admin only.

## Extraction

Extract only a statement that Nick or another identified party has agreed to perform a business-relevant action.

Firm:

- “I told Mrs. Chen I would call tomorrow about the deposit.”
- “Peter said he will send the measurements Friday.”
- “I promised to add the missing trim price to the estimate.”

Original only:

- “Peter may want the upstairs trim done.”
- “I might replace that compressor cabinet.”
- “This fitting could be useful for bath fans.”
- “I should probably call her.”

Mixed: “The flashing is shot, I might replace it, and I told her I'd send a price this week.” Extract only the price promise.

Someone else's promise is still Nick's `action_items` row. Waiting-on lives in the title. He closes it when it happens.

`due_at` is set only when the transcript states a date, or Nick sets it on Correct-then-attach. Null due stays warning.

Suggested entity comes from a named customer or record in the transcript. Otherwise the picker starts empty.

## Day Review

Separate “Needs you” strip. Never merged into AI Day Draft “Accept N ready items.”

Global, not tied to the recording's business date. Renders on the next Day Review Nick opens, including after close and on dates with no business-day record. The strip must render even when the page would otherwise show “No business day found.”

At most three unconfirmed captures per session. Oldest unsnoozed first, then items snoozed from the last session.

Actions: Confirm and attach; Correct, then attach (title and due only; original never edits); Snooze once; Not a commitment.

After one snooze, next review is replay-and-attach or dismiss.

## Write-back

One writer: `action_items` with `action_type = owner_promise` attached to exactly one of `booking_request`, `estimate`, `job`, `invoice`.

Entity picker order:

1. Today's visits, mapped to a supported parent where possible.
2. Open estimates.
3. Unpaid invoices.
4. Customer-name search returning supported entities.

No supported entity means no confirmation.

Additive migration:

- `source_capture_id` on `action_items`, unique when present.
- Promise rows are not constrained by the legacy `(account_id, entity_id, action_type)` open uniqueness.
- Legacy uniqueness remains for rows with `source_capture_id IS NULL`.

Do not implement TASK-049.

## Priority surface

Do not add a frog card or promise scorer. Add exactly one bucket on both `/app` and `/app/action-queue`:

- Label: Customer Promises
- Count: open promise `action_items`
- Tone: danger when any is overdue (`due_at < now()`); otherwise warning
- Destination: open promise rows on `/app/action-queue` (`?promises=1` is fine)

Each row: title, entity, due, open entity, mark done. No auto-complete from invoice paid or estimate declined.

## Failure handling

The original survives transcription, extraction, association, and write-back failures. Failed processing retries without a new recording. Failed write-back remains unconfirmed and never claims success. No unconfirmed candidate appears as an authoritative customer promise. No customer receives a message.

## Measurement

Paper/note log only: (1) captures containing a real commitment, (2) whether it reappeared for confirmation, (3) dropped commitments never captured. If (3) dominates, improve capture access, not extraction.

## Out of scope

Coaching, weekly goals, new rituals, photo interpretation, broad classification, call/message monitoring, energy check-ins, autonomous customer communication, dashboards, builder mode, LLM ranking of the day, visit-note/materials writers, Owner OS framework.
