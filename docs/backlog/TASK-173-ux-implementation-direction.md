# TASK-173: UX implementation direction

Status: In Progress

Phase: cross-cutting

Problem:
Operational screens still make Nick choose among database objects, equal-weight
buttons, and report labels that do not match the events they measure. The
working brief is `docs/working/ux-implementation-direction.md`.

Business Value:
The same plumbing supports fewer decisions: one next action, information
entered once, and money figures that mean what they say.

Scope:
- Follow `docs/superpowers/plans/2026-10-02-ux-implementation-direction.md`.
- Wave 1: Today's Work, quiet End Day, Capture copy, progressive staff intake,
  request next-action hierarchy, report date basis and labels, travel-rate
  display.
- Later waves stay in that plan. Do not rebuild working subsystems.
- Preserve `docs/canonical/` on product identity and phase scope. Phase 4
  Production Intelligence and LiDAR are not part of Wave 1.

Out of Scope:
- A greenfield UI or a second estimate, inbox, or day-review engine.
- Changing company deposit policy storage until Wave 4.
- A technician scorecard. Wave 1 only renames the visit-completion section.

Acceptance Criteria:
- [x] Before day start, Start Day is the primary action. End Day is still reachable and does not lead the started day.
- [x] Today's Work lists scheduled jobs and looks together. The cards do not ask which backend object they are.
- [x] Capture can be saved with no category, customer, or job, and the typed prompt is not promise-only.
- [x] Staff intake can save before category, preferred date, or address are known. Those fields remain available. Migration `200_intake_progressive_capture.sql` is applied in production.
- [x] A request's recommended next step is the dominant action. Pricing and status are secondary.
- [x] Pricing Health uses the account minimum service fee.
- [x] Invoiced, Cash Collected, and Outstanding AR use the definitions in brief section 30.
- [x] Month-End Close does not report clean receivables when an older invoice is still open.
- [x] A timestamp at 11:30 PM Eastern on the last day of a month stays in that business month.
- [x] Visit Volume and Visit Completion are not labeled utilization or tech performance.
- [x] Travel Settings does not show an editable rate while Standard labor is selected.

Still open on this task:
- Waves 1–4 are on main (`f0a1e13d`) and deployed. Production `/api/health` was ok and migration 200 applied. Browser checks for intake, overlap, and deposit defaults are still open.
- Waves 5–6 land in this change. Migration `201_handling_card_fee_and_line_outcomes.sql` applies on deploy.
  - Assessment areas show captured, needs confirmation, or not started. Photos and notes stay on the current assessment record. Markup, geometry, T1/T1R, and LiDAR are not started.
  - An estimate header shows how many items are ready and links to lines with a blank description or a price of zero or less.
  - A work item can end completed, changed, removed/credited, deferred, or not completed.
  - Invoice review lists those exceptions and asks about a card fee when the policy is above zero. Send stays available.
  - A visit can record materials needed. A new receipt suggests the active visit's job when the page was opened without a job.
  - Search finds a house by client name, property name, street, room text, or invoice number.
  - Pricing settings store the material-handling percent and the card-fee percent. A non-draft invoice snapshots both.
- Phase 4 LiDAR and the production library stay deferred.

## Approved Today + Active Visit follow-up — 2026-10-03

Implements the reviewed design within this task and UX direction sections
22–23 and 26. This is a presentation change on the existing visits, tasks,
completion packet, closeout, activity, clock, and mileage records.

- [x] Today shows assigned visits on the business date and unfinished active
  carry-over. Future and unscheduled work does not masquerade as today's stops.
  Day setup and the GPS arrival proposal retain their existing handlers.
- [x] The house address, purpose, first unfinished task, and remaining plan lead
  Active Visit. Partial work explicitly records the remainder; it never implies
  drying. Completed tasks stay locked.
- [x] Photo, Note, Materials, and Add work open focused tools. Completion photos,
  materials used, and visit notes report recorded facts. Notes do not imply
  customer contact. Scope, assignment, specialist controls, and history remain
  available under Visit details & history.
- [x] Finish opens the existing completion packet and closeout. Coming back keeps
  the job open; Whole job done uses the existing job and bill handlers. Send
  remains explicit and permission-gated. Payroll and mileage stay independent.
- [x] Edited drafts survive a same-tab interruption for up to eight hours,
  scoped by account, user, and visit. A changed server baseline shows the saved
  version and offers explicit draft restoration. Failed saves retain text;
  failed task loads disable planner Save and offer Retry.
- [x] Mobile tools have field-sized targets; the global creation FAB does not
  obscure the visit dock. Desktop uses a work column and recording/leave rail.
  Existing completion and recording deep links open the moved tools.

Verification is documented in
[Today + Active Visit validation](../validation/today-active-visit.md).
No new routes, tables, migrations, or operational test records were added to
production. Deployment has not been requested or performed.
