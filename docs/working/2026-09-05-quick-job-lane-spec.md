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
- [ ] The job, client, and hours are persisted and queryable afterward.
- [ ] Existing big-job/estimate flows are untouched.

## Testing / verification

- **Unit:** the rate-selection helper (hourly vs price-book vs flat → line
  amount) — pure, table-tested.
- **Integration (Tier 3, real DB + server):** quick-create endpoint makes a
  Job+Visit scoped to the account; tracked minutes on the visit produce the
  expected labor line via `upsertLaborLineFromTrackedTime`. Harness:
  `apps/web/lib/**/__tests__/*.integration.test.ts` (see the push/clock suites).
- **Manual (the real proof):** on the installed PWA, capture a "assemble bed"
  job in ≤3 taps, start/stop time, invoice it — confirm hours pre-filled — in
  under a minute, no paper.
- `pnpm gate:fast` before PR.

## Open questions for the owner (resolve before build)

- Where should "Quick job" live most naturally — a Schedule "+", a My Day
  button, a global quick-add, or all three?
- Trip/minimum charge on hourly quick jobs — is there a minimum (e.g. 1 hr) to
  auto-apply?
- Should a quick job auto-close its business-day/visit on "Done", or stay open
  until end-of-day?
