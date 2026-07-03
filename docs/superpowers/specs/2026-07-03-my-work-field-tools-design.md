# My Work Field Tools — Design Spec

**Date:** 2026-07-03  
**Status:** Draft — pending user review  
**Context:** Stabilize-in-place. Follows day-close checklist (PR #461). Owner-operator field use on phone.

---

## Problem

My Work (`/app/my-work`) is cluttered and mid-day actions are buried:

1. **Dashboard button** — Header "← Dashboard" links to `/app`, but `WorkspaceAutoRoute` redirects phones back to My Work (Auto/Field mode). Office intent is duplicated by the Office peek card anyway. Result: broken or useless navigation on mobile.

2. **Manage day accordion** — Expands the full `WorkdayPanel` (~900 lines, desktop command-center stepper). Mid-day needs (activity switch, mileage) are 2+ taps deep. Feels like a bottleneck despite holding the right tools.

3. **Priority mismatch** — User-ranked mid-day needs: **B** change activity (primary), **C** mileage/odometer (primary), **A** switch vehicle (secondary), **D** office glance (secondary). Current layout optimizes for none of these at the top.

---

## Goals

1. **B + C at zero extra taps** when clocked in — activity and vehicle/odometer visible without opening Manage day.
2. **Declutter My Work** — remove accordion, duplicate End Day in quick actions, mobile Dashboard button.
3. **Odometer anytime** — log a checkpoint reading without closing the mileage session or ending the day.
4. **Office without leaving field** — peek card covers D; no broken dashboard link on phone.

## Non-goals

- Mobile redesign of full owner Dashboard (`/app`)
- New `/app/my-work/tools` route or bottom-sheet-only tools pattern
- Rebuild `WorkdayPanel` for desktop owner surfaces
- Schema migrations

---

## User priorities (confirmed)

| Rank | Need | Treatment |
|------|------|-----------|
| 1 | **B** — Change activity | Always-visible activity row + quick-switch chips |
| 2 | **C** — Mileage / odometer | Always-visible vehicle row; odometer checkpoint anytime |
| 3 | **A** — Switch vehicle | Behind expanded vehicle row (not main surface) |
| 4 | **D** — Office glance | Office peek card; no mobile Dashboard button |

---

## Decision summary

| Topic | Decision |
|-------|----------|
| Mid-day UI | **"Right now" card** — single strip when clocked in |
| Manage day | **Remove** from My Work (`WorkdayPanel` not rendered on `surface="my_day"`) |
| Dashboard btn | **Hide on mobile** (`< 768px`); Office peek remains |
| Office peek link | **`/app/action-queue`** (lighter than full dashboard) |
| Odometer | **Checkpoint anytime** — append reading to open session, does not close session |
| Quick actions | Trim **End My Day** duplicate; keep create flows (expense, estimate, request) |

---

## Surface: My Work layout

### Not clocked in

```
PageHeader (no Dashboard btn on mobile)
[Office peek]                    owner only
[Start My Day]
[Next visit hero]
[Work orders]                    primary
[Quick actions]                  create flows only
```

### Clocked in

```
PageHeader
[Office peek]
[Day status pill]                when setup complete
[Clock bar]
[End My Day]
┌─ Right now ─────────────────┐
│ Activity: Travel  [chips…]  │  B
│ RAM · 42 mi today      [▾]  │  C — tap to expand
└─────────────────────────────┘
[Next visit hero]
[Work orders]
[Quick actions]
```

**Removed:** Manage day accordion, `WorkdayPanel` on My Work, End My Day in quick-action grid, ← Dashboard on mobile.

---

## Component: `FieldRightNowCard`

**Location:** `apps/web/app/app/my-work/FieldRightNowCard.tsx`  
**Rendered by:** `MyDayMobileLayout` when `clockedIn === true`  
**Data:** Reuse server props already loaded by `loadFieldDayData` (`openSession`, `vehicles`, `activityEntries`, `dayMileage`).

### Activity row (B)

Extract/reuse `NowBar` from `ActivityTracker.tsx`:
- Current activity label + elapsed
- Quick-switch chips: travel, job_work, material_run, admin, personal (same as WorkdayPanel)
- Stop tracking button when active

Client-side: `POST /api/v1/activities/switch`, `POST /api/v1/activities/stop` (existing).

### Vehicle row (C + A)

**Collapsed (default):**
- `{nickname} · {milesToday} mi today` or "No vehicle session" with Start link
- Chevron expands inline panel

**Expanded:**
- **Odometer checkpoint** — input + "Save reading" button
  - `PATCH /api/v1/sessions/:id` with checkpoint payload OR new `POST /api/v1/sessions/:id/odometer-checkpoint` if PATCH semantics are close-only today
  - Does **not** set `end_odometer` or close session
  - Validates: reading ≥ last known / session start odometer
  - Toast: "Odometer saved"
- **Switch vehicle** — inline mini-flow (end odometer + new vehicle start) reusing WorkdayPanel switch logic, or link to compact modal
- **Close mileage session** — only when intentionally ending a leg (end odometer + close); secondary action, not the default checkpoint path

### Odometer checkpoint behavior

- Available whenever an **open** vehicle session exists
- Readings stored as session checkpoints (if no column exists, use `vehicle_sessions.notes` append or add lightweight `odometer_checkpoints` JSON — **implementation plan decides minimal storage**)
- User can log multiple times per day (lunch at home, supply run return, etc.)
- Closing the day still uses Day Review close-mileage flow (hard blocker)

---

## Dashboard / Office fix

### Mobile header (`my-work/page.tsx`)

- Render `← Dashboard` only at `min-width: 768px` (CSS class or conditional)
- Tech role unchanged (Visits link only)

### Office peek card

- Keep financial glance ($ outstanding, draft invoices)
- Change `href` from `/app` to `/app/action-queue`
- Label stays **Office →** or becomes **Action queue →**

### WorkspaceAutoRoute

- No change required if mobile Dashboard button is removed
- Explicit office access: Settings → Workspace → Office, or Office peek → action queue

---

## WorkdayPanel fate

| Surface | Change |
|---------|--------|
| `my_day` | **Stop rendering** `WorkdayPanel` in `MyDayMobileLayout` |
| `owner` (if still used) | Unchanged for now |
| End-day tab | Already links to Day Review (PR #461) |

Extract shared vehicle switch / checkpoint API calls into `lib/mileage/` or small hooks so `FieldRightNowCard` and Day Review don't duplicate fetch logic.

---

## Quick actions trim

`FIELD_QUICK_ACTIONS` — remove **End My Day** (primary button exists above). Optional: remove **Log Mileage** if vehicle row covers C (or keep as deep link to history page).

---

## Testing

### Unit
- Odometer checkpoint validation (monotonic, no session close)

### E2E (`my-day-mobile.spec.ts`)
- Clocked-in state shows `data-testid="field-right-now"`
- Activity chips visible without opening accordion
- No `Manage day` summary on page
- Mobile viewport: no Dashboard button in header

### Manual field test
- Clock in → switch activity from Right now → save odometer checkpoint mid-day → switch vehicle → work orders still primary scroll target

---

## Rollout

1. Ship Right now card + remove Manage day + mobile Dashboard fix
2. One real field day: lunch at home (B+C), afternoon job (work orders hero)
3. Defer: desktop My Work changes, full dashboard mobile, checkpoint history UI

---

## Open questions (resolved)

| Question | Resolution |
|----------|------------|
| Mid-day priority | B, C primary; A, D secondary |
| Odometer | Log anytime (checkpoint); close session is separate |
| Dashboard on phone | Hide button; Office peek → action queue |

---

## Approval

Pending user review before implementation plan.