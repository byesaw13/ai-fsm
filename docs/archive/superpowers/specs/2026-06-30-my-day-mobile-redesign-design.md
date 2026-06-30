# My Day Mobile Redesign

**Date:** 2026-06-30  
**Status:** Approved for implementation

## Problem

My Day (`/app/my-day`) is the field surface for technicians and owner-as-technician. The concept is right — one place to start the day and do the work — but on a phone it behaves like a desktop admin console:

- Day-start controls (payroll clock, business day, mileage stepper, activity timer) are scattered across separate bars and a 3-tab horizontal stepper before today's visits appear.
- Common field actions (`FIELD_QUICK_ACTIONS`) are defined but not rendered on the My Day surface (`WorkdayPanel` with `surface="my_day"` hides the quick-actions sidebar).
- Visit workflow actions (Navigate, Call, Start Job) require multiple taps or are tech-only in the UI despite the API supporting owner transitions.
- The page causes **page-level horizontal scroll** on standard phone widths (375–430px) because desktop layouts were reused without a mobile structure.

## Goal

Redesign My Day for mobile so the morning flow is:

1. **Start the day** — one guided checklist (clock in → vehicle/odometer → mileage), not scattered controls.
2. **Go to the next visit** — Navigate, Call, and Start Job are each one tap.

Plus a hard rule: **no page-level horizontal scroll** on phones.

Desktop (≥768px) keeps the existing WorkdayPanel layout with targeted overflow fixes; the new wizard and visit hero are mobile-first additions that also improve tablet narrow widths.

## User Flow (mobile)

```
Header (compact)
  ↓
Start My Day button  OR  Day Status pill (when setup complete)
  ↓
Next Visit hero — Navigate | Call | Start Job
  ↓
Quick actions (wrapping grid)
  ↓
Today's visit cards
  ↓
Manage day (collapsed WorkdayPanel)
```

### Start My Day wizard

Bottom sheet with a 3-step checklist:

| Step | Action | Done when |
|---|---|---|
| 1 | Clock in (payroll) | `/api/v1/time-clock/current` shows open clock |
| 2 | Pick vehicle + starting odometer | Vehicle selected, odometer entered |
| 3 | Start mileage session | Open `vehicle_sessions` row for today |

- Each step shows: **done** (✓), **current** (highlighted), or **waiting**.
- Tapping a step jumps to that step's inline form (reuses existing WorkdayPanel start-day logic, not duplicated API calls).
- When all three are complete, sheet auto-dismisses and collapses to a **Day Status pill**: `Clocked in · F-150 · 42 mi` (tap pill to reopen wizard or expand status).
- Business day open/close stays in **Manage day** — not part of the morning wizard (existing behavior; clock-in may still open business day server-side via existing side effects).

### Next Visit hero

Always shows the highest-priority pending visit:

1. Active (`in_progress` / `arrived`)
2. Overdue (`scheduled` past start time)
3. Next scheduled today

Card contents:

- Job title, client name, property address, scheduled time
- Three equal-width buttons (≥44px tall):
  - **Navigate** — `https://maps.google.com/maps?q={encodeURIComponent(address)}` (fallback if no address: disabled + tooltip)
  - **Call** — `tel:{client.phone}` (disabled if no phone on file)
  - **Start Job** / **Complete Job** — context-aware; uses existing `POST /api/v1/visits/{id}/transition`

Start/Complete buttons are shown for **all field roles** (`tech` and `owner`), not tech-only. Owner already has API permission; the UI gate is the only blocker today.

The hero visit is excluded from the list below to avoid duplication.

### Quick actions

Render `FIELD_QUICK_ACTIONS` on My Day mobile in a **2-column wrapping grid** (no horizontal scroll). Chips:

- New Estimate, New Job, Log Mileage, Add Expense, Upload Receipt, New Request

The existing `FloatingActionButton` (owner/admin only) may overlap — **dedupe**: FAB actions should mirror or subset quick actions; prefer one surface on My Day (the grid) and hide FAB on `/app/my-day` to avoid two "+" entry points.

### Manage day

Collapsed `<details>` or accordion section at the bottom labeled **Manage day**. Contains the full `WorkdayPanel` for mid-day operations:

- Activity timer (NowBar), vehicle switch/correct, end mileage, business day close checklist, today's stats

On mobile, the WorkdayPanel **horizontal stepper is replaced** with a vertical step list or compact 3-segment pill — never a sideways carousel.

## Mobile Layout Contract

Every My Day screen at **375px width** must pass:

| Rule | Implementation |
|---|---|
| No page-level horizontal scroll | `overflow-x: hidden` on `.p7-main` and `.p7-page-container` at `<768px` |
| Flex children shrink | `min-width: 0` on flex items that contain text |
| Long text wraps | `overflow-wrap: anywhere` on addresses, vehicle labels, status copy |
| No horizontal-only primary nav | Stepper → vertical/pill on mobile |
| Intentional horizontal scroll only in optional regions | Activity quick-switch chips stay in a contained `overflow-x: auto` region with `max-width: 100%` |
| Touch targets ≥ 44px | Hero buttons, wizard CTAs, quick-action chips |

### Known overflow sources to fix

| Component | Fix |
|---|---|
| `WorkdayPanel` `.workflow-stepper` | Mobile: vertical stack or full-width segmented control; remove `min-width: 160px` per item on `<768px` |
| `BusinessDayBar` status copy | Short mobile label: status name only; long explanation in expander |
| Vehicle ribbon | Stack plate/odometer on second line |
| `ActivityTracker` chips | Contain in parent with `max-width: 100%`; negative margins removed on mobile |

## Data Changes

`apps/web/app/app/my-day/page.tsx` — extend visit query:

```sql
c.phone AS client_phone
```

No schema migration. `clients.phone` already exists.

Pass to client components:

- `client_phone` on visit rows
- Existing `openSession`, `fieldVehicles`, `fieldActivity` already fetched for WorkdayPanel

## Component Changes

### New files

| File | Purpose |
|---|---|
| `apps/web/app/app/my-day/StartMyDayWizard.tsx` | Bottom-sheet wizard; orchestrates clock → vehicle → mileage steps |
| `apps/web/app/app/my-day/DayStatusPill.tsx` | Collapsed summary after wizard complete; tap to reopen |
| `apps/web/app/app/my-day/NextVisitHero.tsx` | Hero card with Navigate / Call / Start(or Complete) |
| `apps/web/app/app/my-day/FieldQuickActions.tsx` | Mobile wrapping grid for `FIELD_QUICK_ACTIONS` |

### Modified files

| File | Change |
|---|---|
| `my-day/page.tsx` | New mobile layout order; pass `client_phone`; wire wizard state from server props |
| `my-day/MyDayView.tsx` | Remove hero visit from list; simplify visit cards (hero owns primary actions); enable start/complete for owner |
| `WorkdayPanel.tsx` | Extract start-day form logic for wizard reuse; mobile stepper variant; `surface="my_day"` quick actions moved out (replaced by `FieldQuickActions`) |
| `AppShell.tsx` | Hide `FloatingActionButton` when `pathname.startsWith("/app/my-day")` |
| `app/styles/layout.css` | Mobile overflow guards; optional `.my-day-*` layout utilities |

### Unchanged

- Visit transition API (`/api/v1/visits/[id]/transition`)
- Clock/business-day/mileage APIs
- Desktop owner dashboard (`/app`)
- Tech role guards on business pages (invoices, estimates admin, etc.)

## Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| `<768px` | Full new layout: wizard, hero, quick actions, collapsed manage day |
| `768px–1023px` | Same mobile layout (bottom nav active); stepper vertical |
| `≥1024px` | Wizard/pill still available but WorkdayPanel can show side-by-side grid; hero + visits in main column |

## Testing

### Unit

- `FieldQuickActions` renders all `FIELD_QUICK_ACTIONS` labels
- `NextVisitHero` disables Navigate when no address, Call when no phone
- Visit priority sort: active > overdue > next scheduled

### E2E (Playwright, viewport 390×844)

- `/app/my-day` loads without horizontal overflow (`scrollWidth === clientWidth`)
- Start My Day wizard shows 3 steps
- Next visit hero shows Navigate, Call, Start Job buttons when data present
- Owner role sees Start Job (not only "View details →")

### Manual

- iPhone Safari: morning flow start day → navigate → call
- Verify no sideways scroll while scrolling full page top to bottom

## Out of Scope (deferred)

- Deep links from visit card tools (Photos → camera tab on visit detail)
- Merging payroll clock / business day / mileage into one backend concept
- Tech role FAB (techs use quick-action grid instead)
- Full visual redesign of visit detail page

## Implementation Order

1. Mobile overflow fixes (layout contract) — immediate pain relief
2. `NextVisitHero` + `client_phone` query + owner start/complete UI
3. `FieldQuickActions` grid + hide FAB on My Day
4. `StartMyDayWizard` + `DayStatusPill` + collapsed Manage day
5. WorkdayPanel mobile stepper refactor
6. E2E overflow test + manual QA