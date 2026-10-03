# UX Implementation Direction — Build Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make AI-FSM feel like an on-site manager by applying `docs/working/ux-implementation-direction.md` without replacing working plumbing.

**Architecture:** Keep existing routes, queries, reconciliation engines, and record types. Change what the operator sees and the confirmed contradictions in sections 26–30. New screen audits append to the UX brief in the delta-only format from section 27. Canonical docs still win on product identity and roadmap phase scope. Phase 4 Production Intelligence and LiDAR stay later; do not start them as a rebuild.

**Tech Stack:** Next.js app router (`apps/web`), domain package, SQL migrations in `db/migrations`, Vitest unit tests.

**Backlog:** TASK-173. Phase: cross-cutting, with each wave citing the phase below.

**Progress (2026-10-02):** Waves 1–4 are in the working tree. Wave 1 tasks below are checked. Needs Attention priority, Day Review lead, schedule overlap with Move anyway, and the new-estimate deposit mode selector are implemented. Waves 5–6 are not started. Wave 7 stays deferred. Migration `200_intake_progressive_capture.sql` is not applied.

**Source of truth for behavior:** `docs/working/ux-implementation-direction.md`. Sections 22, 23, and 25 apply to every task.

---

## Wave order

Each wave ships on its own. Do not start a later wave by deleting the previous screen.

| Wave | Phase | Brief | Outcome |
| --- | --- | --- | --- |
| 1 | 1 and 3 | §§4–5, 9, 26–27, 30 (labels, minimum, cash, AR, close, timezone, travel rate) | Today, Capture, Intake, Requests, and report labels tell the truth and show one next action |
| 2 | 1 | §§6–7, 26 Day Review and Needs Attention | Exception review and business priority, engines kept |
| 3 | 1 | §28 Schedule | Overlap warning with owner override; destination on cards; Quick Book stays the known-work path |
| 4 | 3 | §29 Deposit | Percentage default, Materials Only / No Deposit / Custom, snapshot on approval |
| 5 | 3 | §§10–13, 15–19 | Assessment area workspace on existing plumbing; estimate review-first; visit closeout and invoice reconcile linked work items |
| 6 | 3 | §§14, 20, 30 remaining settings | Materials in the visit; property search; material handling and card-fee settings |
| 7 | 4, deferred | §§10 LiDAR, 11 full production library | Only after Phases 1–3 are reliable. Same measurement model. No second estimate system |

## Preserve

- Start My Day, one-tap start, wizard only when data is missing
- Capture full-screen recorder, offline queue, no category before capture
- `getRequestGuidance`
- Needs Attention detectors
- Day Review engines (GPS, day draft, production story, mileage, checklist)
- Schedule views, drag reschedule, Quick Book
- Role-aware navigation
- Report query results that are already the right events; fix labels and date basis only

## Do not

- Rebuild Assessment, Day Review, or invoicing because the brief describes a simpler screen
- Add a second inbox, dashboard, or work-item platform in Wave 1
- Silently add customer-billable scope
- Call visit counts "utilization" or visit completion "tech performance"

---

### Task 1: Today's Work and a quiet End Day

**Files:**
- Modify: `apps/web/app/app/my-day/MyDayMobileLayout.tsx`
- Modify: `apps/web/app/app/my-work/page.tsx`
- Modify: `apps/web/app/app/my-work/today-list.ts`
- Test: `apps/web/app/app/my-work/__tests__/today-list.unit.test.ts`

- [x] Keep Start Day dominant before the day starts
- [x] Move End Day below today's list. Keep `data-testid="end-my-day-button"` and `/app/day-review`. Do not hide it
- [x] Render work orders and standalone visits in one "Today's Work" list, soonest first, active work first
- [x] Each card shows customer, property when known, what it is for, time, state, and Start here when known
- [x] Keep the existing queries

### Task 2: Capture copy

**Files:**
- Modify: `apps/web/app/app/capture/CaptureRecorder.tsx`

- [x] Replace "Type the promise." with "Type what you need to remember."
- [x] Replace the promise-only placeholder with an example that can be a reminder, material need, or follow-up
- [x] Do not add category, customer, or job pickers

### Task 3: Progressive intake

**Files:**
- Create: `db/migrations/200_intake_progressive_capture.sql`
- Modify: `apps/web/app/api/v1/intake/route.ts`
- Modify: `apps/web/lib/intake/records.ts`
- Modify: `apps/web/app/app/intake/new/IntakeForm.tsx`
- Test: `apps/web/app/api/v1/intake/__tests__/intake.unit.test.ts`

- [x] Staff intake saves with name, a phone or email, and a short description
- [x] Category, preferred date, and address stay on the form and in the model, and are not required to save
- [x] Do not create a property when address is blank. `jobs.property_id` may be null
- [x] When category is missing, `routing_path` stays `pending`. When category is present, keep `scoreSiteVisitProbability`
- [x] Public booking and portal routes keep sending the fields they already collect

### Task 4: Request next action

**Files:**
- Modify: `apps/web/app/app/requests/[id]/page.tsx`
- Modify: `apps/web/app/app/requests/[id]/ReviewActions.tsx`

- [x] Do not replace `getRequestGuidance`
- [x] Lead with the recommended action and why
- [x] When no path is chosen, the path choice is the primary decision
- [x] When a path is chosen, one primary button leads. Pricing, status buttons, and "Next Record" sit in secondary disclosure
- [x] Replace the visible label "Next Record" with the human action

### Task 5: Reports say what they measure

**Files:**
- Create: `apps/web/lib/reports/business-month.ts`
- Test: `apps/web/lib/reports/__tests__/business-month.unit.test.ts`
- Modify: `apps/web/app/app/reports/queries.ts`
- Modify: `apps/web/app/app/reports/page.tsx`
- Modify: `apps/web/app/app/reports/sections/FinancialSection.tsx`
- Modify: `apps/web/app/app/reports/sections/PricingHealthSection.tsx`
- Modify: `apps/web/app/app/reports/sections/OperationsSection.tsx`
- Modify: `apps/web/app/app/reports/sections/TechnicianSection.tsx`
- Modify: `apps/web/app/app/reports/close/page.tsx`

- [x] Pricing Health uses `business_pricing_settings.minimum_service_fee_cents`, falling back to `MINIMUM_SERVICE_FEE_CENTS` only when the account has no row
- [x] "Invoiced" is invoice totals created in the business month
- [x] "Cash Collected" sums `payments.received_at` in the business month
- [x] "Outstanding AR" is the current open balance on sent, partial, and overdue invoices, every month
- [x] Net is cash collected minus expenses
- [x] Month-End Close shows open invoices created in the period and total open AR. A prior unpaid invoice keeps the period from looking clean
- [x] Timestamp month filters use `to_char(column AT TIME ZONE '<business tz>', 'YYYY-MM')`. `expense_date` and `session_date` stay date filters
- [x] An instant at 11:30 PM Eastern on the last day of a month stays in that month (`2026-04-01T03:30:00.000Z` → `2026-03` in `America/New_York`)
- [x] Rename Schedule Utilization to Visit Volume. Rename Tech Performance to Visit Completion. Do not build a scorecard in this task

### Task 6: Travel rate matches the mode

**Files:**
- Modify: `apps/web/app/app/settings/TravelSettingsForm.tsx`

- [x] Standard labor shows the Labor & Pricing billing rate as read-only
- [x] Custom shows the editable travel rate
- [x] None hides the rate
- [x] Do not change the calculation in `apps/web/lib/travel/calculate.ts`

---

## Later waves (do not invent a second system)

### Wave 2 — Needs Attention and Day Review

Keep detectors and engines. Replace tone-only sort with promise, money, lateness, blocked work, and scheduling consequence. Day Review leads with unresolved items, collapses high-confidence matches, and resumes at the next unresolved item. Files start at `apps/web/lib/attention/` and `apps/web/app/app/day-review/`.

### Wave 3 — Schedule safety

Before `PATCH /api/v1/visits/[id]` treats a dragged visit as saved, detect an overlap for the assigned user and warn. Owner may choose Move anyway. Show property address on week and mobile cards. Quick Book stays for known work. Uncertain new work stays on Intake.

### Wave 4 — Deposit modes

Settings store default percent and wording. Each estimate is Percentage, Materials Only, No Deposit, or Custom. Snapshot mode, amount, and customer wording on approval. Later settings changes do not rewrite approved estimates.

### Wave 5 — Assessment through invoice

Area workspace, photos, notes, and summaries on the current assessment records first. Markup and geometry next. T1/T1R after that. LiDAR last, into the same measurement objects. Estimate is review-first. Approved lines end as completed, changed, removed/credited, deferred, or not completed. Invoice review resolves exceptions before send.

### Wave 6 — Materials, property memory, pricing policies

Need Material from the visit. Receipt suggests the active job. Move material handling and any card-fee policy into account settings with snapshot behavior. Search should find a house by name, street, room, or invoice number.

### Wave 7 — Deferred

LiDAR/RoomPlan and a production library wait for ROADMAP Phase 4. Do not open them from this plan's early waves.

## Verification

```bash
pnpm --filter @ai-fsm/web exec vitest run app/app/my-work/__tests__/today-list.unit.test.ts lib/reports/__tests__/business-month.unit.test.ts app/api/v1/intake/__tests__/intake.unit.test.ts app/app/requests/__tests__/request-guidance.unit.test.ts
```

Expected: PASS.

Business-logic changes in a wave need a unit test or a documented gap in the task.
