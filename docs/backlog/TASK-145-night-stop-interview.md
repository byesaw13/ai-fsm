# TASK-145: Night stop interview — protect the day, move forward

Status:
In Progress

Phase:
3

Problem:
GPS already records the day’s stops. Day Review does not ask what each stop
was. Completing a visit is the only interview, so if Complete is skipped the
day is guessed as `job_work` or left unbilled.

Lived 2026-09-14:

- Peter / 4 Ash (open `J-2026-0029`) — started, left for tools, returned, left
  for a call, returned.
- TJ Abernathy / 63 Landing — tool pickup in the morning (short; GPS missed or
  dismissed), then a **new** fridge leak after the garage-door job was already
  `invoiced`. Afternoon Landing candidates confirmed `job_work` with **no
  `job_id`**.
- Home Depot between Ash and Landing — store stop, no receipt interview.
- 8 Bus Rd geocoded as Peter’s house and auto-confirmed as job work.

The owner expected a prompt: walk the stops, say what each was, and let the
system create jobs and settle billing.

Business Value:
The night is a refresher and a safety net. Today’s GPS log becomes the day’s
story. New work at a closed house becomes a job. Store stops meet receipts.
Tomorrow is planted before Close Day.

Scope:
- Day Review leads with today’s GPS **stops** (not home, not dismissed noise).
- Each stop asks **What were you there for?**
  - Work on the open job at this house
  - New work here (no open job, or a different problem)
  - Pickup / tools (not a bill)
  - Store / materials
  - Not work
- Work / new work require **What did you do?** and done vs coming back
  (reuse visit closeout).
- New work creates a job on that property (`property_id` + client), then
  files the stop onto it.
- Store stop lists today’s unreviewed receipts to file.
- 8 PM push copy: walk today’s stops, then close.
- Mechanical close (clock, odometer) stays **after** the interview.

Out of Scope:
- Chatbot / free-form operator
- Reconstructing GPS stops that never existed (morning Landing pickup if
  dismissed)
- Auto-creating a customer from an unknown address (236 N Broadway)
- Replacing Complete on the visit (Complete stays the live closeout)

Acceptance Criteria:
- [ ] 4 Ash with an open job offers “Work on this job” and saves today’s notes
- [ ] 63 Landing with only an invoiced job does **not** silently attach to it;
      it offers “New work here” and creates a job on that property
- [ ] Home Depot offers Store and can attach a same-day receipt
- [ ] Pickup does not create or reopen a customer invoice
- [ ] Unanswered stops block Close Day
- [ ] Tests: invoiced house → new_work option; open job → job_work default;
      store place → store default

Notes:
Parent of the night leftover idea in TASK-138 (counts stay on Overview). This
task is the **question walk**. GPS matching stays; we stop treating
Accept-ready `job_work` as the day’s story.
