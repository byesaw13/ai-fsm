# Day Close Checklist — Design Spec

**Date:** 2026-07-03  
**Status:** Draft — pending user review  
**Context:** Stabilize-in-place (no rebuild). Follows PR #460 (clock out + End My Day discoverability).

---

## Problem

Field users can reach "Ready to close today" on My Work, but the checklist is **honor-system only** — five checkboxes with no actions to review payroll, activities, mileage, materials, or notes. The actionable close flow already exists in `WorkdayPanel` → "Review & Close Day", but it is buried under a collapsed **Manage day** accordion. Day Review (`/app/day-review`) shows read-only summaries and a **Close Day** button with no inline fixes.

Result: users are reminded what to do but cannot do it in place. Pages feel cluttered when multiple close surfaces compete (BusinessDayBar checkboxes + WorkdayPanel + Day Review).

---

## Goals

1. **Simple and obvious** — one path to close the day.
2. **Uncluttered My Work** — no duplicate checklists or honor-system checkboxes.
3. **Seamless logic** — status is computed from real state; actions live on the same row.
4. **Works for owner and tech** — same Day Review ritual.

## Non-goals

- New API routes or business-day state machine changes.
- Multi-page wizard or modal stack.
- Redesign of visit classification / location intelligence.
- Blocking close on soft warnings (jobs in progress, receipt photos, notes).

---

## Decision summary

| Topic | Decision |
|-------|----------|
| Close surface | **C1 — Day Review owns the ritual** |
| My Work | Payroll bar + **End My Day** only (no checklist) |
| My Work banner | **Deferred** — ship without banner; add one-line blocker count later if field testing shows need |
| Notes | **Soft warning** — prompt "Anything else you need to note?" with optional acknowledge; does not block close |
| Checklist items | **Auto-detected** — no manual checkboxes |
| Implementation | Extract shared `DayCloseChecklist` from `WorkdayPanel` end-day cards |

---

## User flow

```text
My Work (lean)
  Payroll bar (clock in/out)
  [End My Day] → /app/day-review

Day Review (close ritual)
  Progress: "3 of 5 ready" (hard blockers only)
  ┌─ Payroll ──────────────── [Clock Out] or ✓
  ├─ Activity ─────────────── [Stop tracking] or ✓
  ├─ Mileage ──────────────── [Close mileage] or ✓
  ├─ Expenses ─────────────── [Add expense] / [Attach photos] or ✓
  └─ Notes (soft) ─────────── "Anything else to note?" [I'm good] or link to visits
  [Close Day] — enabled when hard blockers clear

After close
  "Day closed" + optional reopen link (existing behavior)
```

No separate **Mark day ready to close** step on My Work. `POST /api/v1/day-review/close` already transitions `ACTIVE → READY_TO_CLOSE → CLOSED`.

---

## Surface: My Work (`/app/my-work`)

### Keep

- `ClockBar` when clocked in (PR #460).
- **End My Day** button → `/app/day-review`.
- **Manage day** accordion with `WorkdayPanel` for power users (mileage switch, activity tracker) — not part of the primary close path.

### Remove

- `BusinessDayBar` checklist block ("Ready to close today?" + five manual checkboxes).
- **Mark day ready to close** button on My Work (redundant with Day Review close).

### BusinessDayBar on My Work

Show a **minimal status chip only** when useful (e.g. "Day active" / "Day closed") — no checklist, no transition buttons. Day lifecycle actions move to Day Review. If the chip adds clutter with no new information, omit it entirely on My Work.

### Optional follow-up: blocker banner (not in v1)

If field testing shows users forget to open Day Review:

> `2 items left before you can close` → links to `/app/day-review`

Single muted line under **End My Day**. No checklist. Feature-flag or follow-up PR.

---

## Surface: Day Review (`/app/day-review`)

Replace the current read-only layout + blind **Close Day** with a **task list first**, detail sections second.

### Task list (`DayCloseChecklist`)

Shared client component used by Day Review (primary). `WorkdayPanel` end-day tab links here or embeds the same component (no duplicated markup).

| Task | Hard blocker? | Done when | Row action |
|------|---------------|-----------|------------|
| **Payroll** | Yes | No open payroll clock | Inline **Clock Out** (reuse `ClockBar` logic or embed mini control) |
| **Activity** | Yes | No running activity entry | **Stop tracking** button |
| **Mileage** | Yes | No open vehicle session | End odometer input + **Close mileage** (reuse session close from `WorkdayPanel`) |
| **Expenses** | No (soft) | Zero receipt expenses missing photos | **Attach photos** → `/app/expenses`; **Add expense** → `/app/expenses/new` |
| **Notes** | No (soft) | User acknowledges prompt | Copy: *"Anything else you need to note from today?"* + **I'm good** toggle; optional link to today's visits list |

**Hard blockers** gate the **Close Day** button. **Soft items** show yellow/warning styling but do not disable close.

### Detail sections (below checklist)

Keep existing `VisitsSection`, `TimeSection`, `MileageSection` as expandable reference — collapsed by default on mobile so the page leads with actions, not walls of data.

### Close Day button

- Bottom of page, full width (existing `CloseButton` behavior).
- Disabled while any **hard** blocker is open.
- Label when blocked: `Close Day — finish payroll first` (or generic `N items left`).
- Soft warnings may show a subtitle: `2 soft reminders — you can still close`.

### Data loading

Extend `getDayReview` (or add `getDayCloseStatus` query) to return close-task payload in one server fetch:

- `clockOpen: boolean` (+ clock id if open)
- `activeActivityId: string | null`
- `openSession: { id, vehicleName, startOdometer } | null`
- `missingReceiptPhotos: number`
- `visitsToday: number` (for notes context)

Reuse SQL / warning logic already computed for `WorkdayPanel` / `loadFieldDayData` where possible.

---

## Surface: WorkdayPanel

- **Review & Close Day** tab: replace inline duplicate cards with link/prompt → **Open Day Review** (or embed `DayCloseChecklist`).
- Remove pointer text "Close from Business Day header" (header checklist goes away on My Work).

---

## Component architecture

```
apps/web/app/app/day-close/
  DayCloseChecklist.tsx      # shared task rows + actions
  day-close-status.ts        # pure: derive hard/soft status from payload
  types.ts

apps/web/lib/day-review/
  close-status.ts              # server query for checklist payload (or extend queries.ts)

apps/web/app/app/day-review/page.tsx
  # server fetch + DayCloseChecklist + collapsed detail sections + CloseButton

apps/web/app/app/my-day/MyDayMobileLayout.tsx
  # remove BusinessDayBar checklist exposure; keep End My Day

apps/web/app/app/BusinessDayBar.tsx
  # strip READY_TO_CLOSE checklist UI; keep for non-my_day surfaces if needed
```

---

## Testing

### Unit

- `day-close-status.ts`: hard blocker count, soft warnings, close enabled/disabled.
- Notes acknowledgment does not affect `canClose`.

### Integration

- Day Review page renders checklist with mocked open clock / session.
- Close Day returns 409 when hard blockers remain (client disables button; server unchanged).

### E2E (extend `day-review.spec.ts`)

- Navigate to Day Review with open day → see task rows.
- **End My Day** from My Work lands on Day Review checklist.

---

## Rollout

1. Ship C1 (no My Work banner).
2. Owner runs one real field day: start → work → End My Day → fix rows → Close Day.
3. If users miss Day Review, add optional banner in a small follow-up.

---

## Open questions (resolved)

| Question | Resolution |
|----------|------------|
| Where does close live? | Day Review (C1) |
| Notes strictness? | Soft prompt + optional acknowledge |
| My Work banner? | Deferred — not in v1 |

---

## Approval

Pending user review of this spec before implementation plan.