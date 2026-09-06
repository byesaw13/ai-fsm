# Quick-Job Lane — spec (TASK-119)

Status: draft for build · Owner workflow review 2026-09-05 · EPIC-006, Phase 2

## Context / why

For quick jobs ("come assemble a bed"), the owner **abandons the app** —
schedules it "in my head or on paper" — then makes a manual invoice and re-enters
everything. The job is lost at the source: hours, client history, repeat-work
signal. The app is built around the big-job spine (estimate → job → visits →
invoice); a quick, no-estimate, hourly job has no fast lane, so it never gets
captured. This is the #1 end-user accessibility failure.

Goal: a **capture → do → bill** lane, three taps, no estimate, that puts the job
in the system and carries the hours straight to the invoice.

## What already exists (reuse — do not rebuild)

- **Quick capture — ALREADY BUILT:** `POST /api/v1/quick-book` +
  `QuickBookModal` (`apps/web/app/app/schedule/`) create client-or-new + job +
  default work order (`lib/work-orders/create-default.ts`) + scheduled visit in
  ONE transaction, no estimate. **This is the capture step** — do not rebuild it
  or extend the separate `jobs/new` Quick Project path.
- **Schedule = visits:** `apps/web/app/app/schedule/ScheduleCalendar.tsx`; a
  visit carries `client_name`, `scheduled_start/end`; `visits.job_id` references
  a job (`ON DELETE SET NULL`).
- **Time capture:** the payroll/activity clock (`lib/operations/time-clock.ts`,
  `activity_entries`) + the new arrival Web Push (TASK-118).
- **Tracked-time → invoice labor:** `upsertLaborLineFromTrackedTime`
  (`apps/web/lib/invoices/line-items.ts`) turns tracked minutes into a labor line
  at `labor_billing_cents_per_hour`.
- **Price book:** seeded task rates (migration 018), used by the Quick Estimate
  wizard — reusable for known-task flat rates (light, faucet).
- **Visit-completion → invoice-draft** bridge (workflow automation pass).

The pieces exist; the lane is the **seams** between them.

## The flow

### 1. Capture — ALREADY BUILT (quick-book)
`quick-book` already does one-transaction capture (client-or-new + job + default
work order + scheduled visit, no estimate) via `QuickBookModal` on the schedule.
The only residual on the capture side is **discoverability** — surfacing that
entry point beyond the calendar (a My Day / global quick-add shortcut) and a
"now" option that drops straight into the do-it state. **Do not build a second
booking flow.**

### 2. Do it (time auto-captured)
On arrival (or "Start") one tap begins time on the visit via the existing clock /
activity; arrival push already nudges. One tap "Done" stops it. No manual timing.
Tracked minutes accrue against the visit → job.

### 3. Bill (one tap)
"Invoice" from the job creates a draft with a **labor line pre-filled from
tracked time** at `labor_billing_cents_per_hour` (via the existing bridge). A
one-tap toggle switches the line to:
- a **price-book task rate** (for known tasks — light, faucet), or
- a **flat fee** the owner types,
whichever is most profitable. Add materials/receipts if any. Send.

## Pricing

Default **hourly** (`labor_billing_cents_per_hour`). Price-book rate on demand
for known tasks. This lane needs exactly **one** bill rate — a good moment to
stop surfacing the 4-rate ambiguity (pricing-reality memory) in this path; full
rate reconciliation stays with pricing work (PI-002/004), not blocking here.

## Edge cases

- **Walk-up / same-day:** capture with "now" must be ≤ 3 taps; don't require a
  future slot.
- **Unknown client:** typing a new name creates a lightweight client inline (name
  only; details later) — never block on a full client record.
- **Forgot to start the clock:** allow a manual time entry/correction on the
  visit (the clock-correction pattern from TASK-052 is the reference).
- **No time tracked at all:** invoice still offers flat/price-book so the job is
  billable without hours.

## Acceptance criteria

- [ ] Capture uses the existing quick-book flow — no duplicate booking path added.
- [ ] On-site time is captured with one tap on the quick-booked visit and appears
      on the invoice with no manual re-entry.
- [ ] Invoice defaults to hourly at the bill rate; switch to price-book or flat
      in one action.
- [ ] The billed total is floored to the existing `minimum_service_fee_cents`
      (no second minimum introduced); a per-job override is possible via the
      existing override path.
- [ ] `QuickBookModal` is reachable from all three launch points (Schedule +,
      My Day, global FAB) via one shared component — no forked flow.
- [ ] "Done" closes the visit only; the business day stays open until Day Review.
- [ ] The job, client, and hours are persisted and queryable afterward.
- [ ] Existing big-job/estimate flows are untouched.

## Testing / verification

- **Unit:** the rate-selection helper (hourly vs price-book vs flat → line
  amount) — pure, table-tested — **including the `minimum_service_fee_cents`
  floor** (below-minimum time floors to the setting; override respected).
- **Integration (Tier 3, real DB + server):** tracked minutes on a quick-booked
  visit produce the expected labor line via `upsertLaborLineFromTrackedTime`,
  floored to the service minimum; "Done" closes the visit while the business day
  stays open. Harness: `apps/web/lib/**/__tests__/*.integration.test.ts`.
- **Component/manual:** the three launch points (Schedule +, My Day, global FAB)
  all open the same `QuickBookModal`.
- **Manual (the real proof):** on the installed PWA, capture a "assemble bed"
  job in ≤3 taps, start/stop time, invoice it — confirm hours pre-filled — in
  under a minute, no paper.
- `pnpm gate:fast` before PR.

## Decisions (owner, 2026-09-05) — resolved

1. **Entry point = all three launch points, one shared modal.** Surface the
   existing `QuickBookModal` from the Schedule "+" (already there), a **My Day**
   button, and the global **FloatingActionButton** / quick-add. One component,
   three launch points — reach it from wherever the job comes in (calendar
   planning, in the field, an ad-hoc call). Do not fork the flow.
2. **Minimum charge = reuse the EXISTING service minimum, not a new floor.**
   `business_pricing_settings.minimum_service_fee_cents` already exists and is the
   pricing minimum via `buildPricingRules` (`packages/domain/src/pricing-settings.ts`),
   with a per-record override path (`minimum_service_override_reason/note`). Floor
   the quick-job total to that single configured minimum — do **NOT** add a
   separate 1-hour minimum (that would be a second source of pricing truth and
   could underbill the configured value, currently ~$185). The owner's
   "configurable minimum" intent is satisfied by that setting; if a one-hour floor
   is wanted, set `minimum_service_fee_cents` to one hour's bill rate. Per-job
   adjustment uses the existing override mechanism. The line can still switch to a
   price-book rate or flat fee ("whichever is most profitable").
3. **On "Done" → close the visit, keep the business day open.** Completing the
   quick job closes its visit (billable/done) but the business day stays open for
   more jobs and closes at Day Review. This matches the operations-engine
   independence (payroll/day and visit lifecycles are separate — TASK-052/056).

Build-affecting deltas these add to TASK-119: the configurable minimum-hours
setting + its application to the labor line; the three launch points around the
one QuickBookModal; and "Done closes the visit only."
