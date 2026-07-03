# Day Close Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make end-of-day close simple and actionable — My Work stays lean (End My Day only); Day Review shows an auto-detected task list with inline fixes and a gated Close Day button.

**Architecture:** Server query `loadDayCloseStatus` returns blocker facts; pure `deriveDayCloseStatus` computes hard/soft items; shared client `DayCloseChecklist` renders task rows with actions extracted from `WorkdayPanel` end-day patterns. Remove honor-system checkboxes from `BusinessDayBar` on My Work.

**Tech Stack:** Next.js App Router, React client components, PostgreSQL via `queryForSession`, Vitest unit tests, Playwright e2e

**Spec:** `docs/superpowers/specs/2026-07-03-day-close-checklist-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/lib/day-review/close-status.ts` | Server query: clock, activity, session, expenses, visits |
| `apps/web/app/app/day-close/day-close-status.ts` | Pure derive: `canClose`, hard/soft counts, row states |
| `apps/web/app/app/day-close/types.ts` | `DayCloseStatusPayload`, row enums |
| `apps/web/app/app/day-close/DayCloseChecklist.tsx` | Actionable task rows + notes soft prompt |
| `apps/web/app/app/day-close/__tests__/day-close-status.unit.test.ts` | Pure status derivation tests |
| `apps/web/app/app/day-review/page.tsx` | Checklist-first layout + collapsed detail sections |
| `apps/web/app/app/day-review/CloseButton.tsx` | Accept `disabled` + blocker label from parent |
| `apps/web/app/app/my-day/MyDayMobileLayout.tsx` | Remove `BusinessDayBar` from My Work |
| `apps/web/app/app/BusinessDayBar.tsx` | Remove READY_TO_CLOSE honor checkbox block |
| `apps/web/app/app/WorkdayPanel.tsx` | End-day tab → link/embed `DayCloseChecklist` |
| `tests/e2e/day-review.spec.ts` | Assert checklist visible on Day Review |

---

### Task 1: Close status types + pure derivation

**Files:**
- Create: `apps/web/app/app/day-close/types.ts`
- Create: `apps/web/app/app/day-close/day-close-status.ts`
- Create: `apps/web/app/app/day-close/__tests__/day-close-status.unit.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/web/app/app/day-close/__tests__/day-close-status.unit.test.ts
import { describe, it, expect } from "vitest";
import { deriveDayCloseStatus } from "../day-close-status";
import type { DayCloseStatusPayload } from "../types";

const base: DayCloseStatusPayload = {
  clockOpen: false,
  activeActivity: null,
  openSession: null,
  missingReceiptPhotos: 0,
  visitsToday: 2,
  notesAcknowledged: false,
};

describe("deriveDayCloseStatus", () => {
  it("canClose when no hard blockers", () => {
    const s = deriveDayCloseStatus(base);
    expect(s.canClose).toBe(true);
    expect(s.hardBlockerCount).toBe(0);
  });

  it("blocks close when payroll clock open", () => {
    const s = deriveDayCloseStatus({ ...base, clockOpen: true });
    expect(s.canClose).toBe(false);
    expect(s.rows.payroll.status).toBe("blocked");
  });

  it("blocks close when activity running", () => {
    const s = deriveDayCloseStatus({
      ...base,
      activeActivity: { id: "a1", activityType: "job_work", label: "Job work" },
    });
    expect(s.canClose).toBe(false);
    expect(s.rows.activity.status).toBe("blocked");
  });

  it("blocks close when mileage session open", () => {
    const s = deriveDayCloseStatus({
      ...base,
      openSession: { id: "s1", vehicleName: "RAM", startOdometer: 12000 },
    });
    expect(s.canClose).toBe(false);
    expect(s.rows.mileage.status).toBe("blocked");
  });

  it("expenses missing photos is soft only", () => {
    const s = deriveDayCloseStatus({ ...base, missingReceiptPhotos: 2 });
    expect(s.canClose).toBe(true);
    expect(s.rows.expenses.status).toBe("warning");
    expect(s.softWarningCount).toBeGreaterThan(0);
  });

  it("notes prompt is soft and clears when acknowledged", () => {
    expect(deriveDayCloseStatus(base).rows.notes.status).toBe("warning");
    expect(deriveDayCloseStatus({ ...base, notesAcknowledged: true }).rows.notes.status).toBe("ok");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /home/nick/ai-fsm-deploy-clean && pnpm --filter @ai-fsm/web test:unit -- day-close-status.unit
```

Expected: module not found

- [ ] **Step 3: Implement types + derivation**

```ts
// apps/web/app/app/day-close/types.ts
export type DayCloseRowStatus = "ok" | "blocked" | "warning";

export type DayCloseStatusPayload = {
  clockOpen: boolean;
  activeActivity: { id: string; activityType: string; label: string } | null;
  openSession: { id: string; vehicleName: string | null; startOdometer: number } | null;
  missingReceiptPhotos: number;
  visitsToday: number;
  notesAcknowledged: boolean;
};

export type DayCloseDerived = {
  canClose: boolean;
  hardBlockerCount: number;
  softWarningCount: number;
  readyCount: number;
  totalTasks: number;
  rows: {
    payroll: { status: DayCloseRowStatus };
    activity: { status: DayCloseRowStatus };
    mileage: { status: DayCloseRowStatus };
    expenses: { status: DayCloseRowStatus };
    notes: { status: DayCloseRowStatus };
  };
  closeButtonHint: string;
};
```

```ts
// apps/web/app/app/day-close/day-close-status.ts
import type { DayCloseDerived, DayCloseRowStatus, DayCloseStatusPayload } from "./types";

function row(ok: boolean, soft = false): DayCloseRowStatus {
  if (ok) return "ok";
  return soft ? "warning" : "blocked";
}

export function deriveDayCloseStatus(payload: DayCloseStatusPayload): DayCloseDerived {
  const payroll = row(!payload.clockOpen);
  const activity = row(!payload.activeActivity);
  const mileage = row(!payload.openSession);
  const expenses = row(payload.missingReceiptPhotos === 0, payload.missingReceiptPhotos > 0);
  const notes = row(payload.notesAcknowledged, !payload.notesAcknowledged);

  const rows = { payroll, activity, mileage, expenses, notes };
  const hardBlockerCount = [payroll, activity, mileage].filter((s) => s === "blocked").length;
  const softWarningCount = [expenses, notes].filter((s) => s === "warning").length;
  const readyCount = Object.values(rows).filter((s) => s === "ok").length;

  let closeButtonHint = "Close Day";
  if (hardBlockerCount === 1 && payload.clockOpen) closeButtonHint = "Close Day — clock out first";
  else if (hardBlockerCount === 1 && payload.activeActivity) closeButtonHint = "Close Day — stop activity first";
  else if (hardBlockerCount === 1 && payload.openSession) closeButtonHint = "Close Day — close mileage first";
  else if (hardBlockerCount > 1) closeButtonHint = `Close Day — ${hardBlockerCount} items left`;

  return {
    canClose: hardBlockerCount === 0,
    hardBlockerCount,
    softWarningCount,
    readyCount,
    totalTasks: 5,
    rows,
    closeButtonHint,
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @ai-fsm/web test:unit -- day-close-status.unit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/app/day-close/
git commit -m "feat(day-close): add pure close status derivation"
```

---

### Task 2: Server query for close status

**Files:**
- Create: `apps/web/lib/day-review/close-status.ts`
- Modify: `apps/web/app/app/day-review/page.tsx` (import only — wire in Task 3)

- [ ] **Step 1: Implement `loadDayCloseStatus`**

```ts
// apps/web/lib/day-review/close-status.ts
import { queryForSession } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";
import { ACTIVITY_TYPE_META, type ActivityType } from "@ai-fsm/domain";
import type { DayCloseStatusPayload } from "@/app/app/day-close/types";

export async function loadDayCloseStatus(
  session: SessionPayload,
  date: string, // YYYY-MM-DD
): Promise<DayCloseStatusPayload | null> {
  const [clockRows, activityRows, sessionRows, receiptRows, visitRows] = await Promise.all([
    queryForSession<{ status: string }>(
      session,
      `SELECT status FROM time_clock_sessions
       WHERE account_id = $1 AND user_id = $2 AND status = 'open' AND voided_at IS NULL
       ORDER BY clock_in_at DESC LIMIT 1`,
      [session.accountId, session.userId],
    ),
    queryForSession<{ id: string; activity_type: string }>(
      session,
      `SELECT id, activity_type FROM activity_entries
       WHERE account_id = $1 AND user_id = $2 AND ended_at IS NULL AND voided_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [session.accountId, session.userId],
    ),
    queryForSession<{ id: string; vehicle_nickname: string | null; start_odometer: number }>(
      session,
      `SELECT s.id, v.nickname AS vehicle_nickname, s.start_odometer
       FROM vehicle_sessions s LEFT JOIN vehicles v ON v.id = s.vehicle_id
       WHERE s.account_id = $1 AND s.session_date = $2::date
         AND s.end_odometer IS NULL AND s.miles IS NULL
       ORDER BY s.started_at DESC LIMIT 1`,
      [session.accountId, date],
    ),
    queryForSession<{ count: string }>(
      session,
      `SELECT COUNT(*)::text AS count FROM expenses
       WHERE account_id = $1 AND expense_date = $2::date
         AND receipt_url IS NULL`,
      [session.accountId, date],
    ),
    queryForSession<{ count: string }>(
      session,
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1 AND assigned_user_id = $3
         AND scheduled_start::date = $2::date
         AND status NOT IN ('cancelled')`,
      [session.accountId, date, session.userId],
    ),
  ]);

  const active = activityRows[0];
  const meta = active ? ACTIVITY_TYPE_META[active.activity_type as ActivityType] : null;

  return {
    clockOpen: clockRows[0]?.status === "open",
    activeActivity: active
      ? { id: active.id, activityType: active.activity_type, label: meta?.label ?? active.activity_type }
      : null,
    openSession: sessionRows[0]
      ? {
          id: sessionRows[0].id,
          vehicleName: sessionRows[0].vehicle_nickname,
          startOdometer: sessionRows[0].start_odometer,
        }
      : null,
    missingReceiptPhotos: parseInt(receiptRows[0]?.count ?? "0", 10),
    visitsToday: parseInt(visitRows[0]?.count ?? "0", 10),
    notesAcknowledged: false, // client-only for v1
  };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @ai-fsm/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/day-review/close-status.ts
git commit -m "feat(day-close): server query for close blockers"
```

---

### Task 3: DayCloseChecklist client component

**Files:**
- Create: `apps/web/app/app/day-close/DayCloseChecklist.tsx`
- Modify: `apps/web/app/app/day-review/CloseButton.tsx`

- [ ] **Step 1: Extend CloseButton to accept gating props**

```tsx
// CloseButton.tsx — add props:
disabled?: boolean;
label?: string;

// button:
disabled={loading || disabled}
{loading ? "Closing…" : (label ?? "Close Day")}
```

- [ ] **Step 2: Implement DayCloseChecklist**

Client component responsibilities:
- `useState` for `notesAcknowledged`, `endOdometer`, `busy`
- Merge server payload + `notesAcknowledged` → `deriveDayCloseStatus`
- Listen to `ops:refresh` + `router.refresh()` after actions (mirror `ClockBar`)
- Row actions (reuse existing APIs):
  - Payroll: `POST /api/v1/time-clock/clock-out` when `clockOpen`
  - Activity: `POST /api/v1/activities/stop` when `activeActivity`
  - Mileage: `PATCH /api/v1/sessions/:id` with `{ end_odometer }` (copy validation from `WorkdayPanel.closeSession`)
  - Expenses: `Link` to `/app/expenses` and `/app/expenses/new`
  - Notes: copy *"Anything else you need to note from today?"* + button **I'm good** sets `notesAcknowledged`
- Progress line at top: `{readyCount} of {totalTasks} ready`
- Pass `canClose` / `closeButtonHint` to `CloseButton`

Use existing `p7-btn` / card styles from `WorkdayPanel` end-day rows for visual consistency.

- [ ] **Step 3: Manual smoke**

Start dev server, open `/app/day-review` with open business day — checklist renders (Task 4 wires page).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/app/day-close/DayCloseChecklist.tsx apps/web/app/app/day-review/CloseButton.tsx
git commit -m "feat(day-close): actionable checklist component"
```

---

### Task 4: Day Review page — checklist first

**Files:**
- Modify: `apps/web/app/app/day-review/page.tsx`

- [ ] **Step 1: Fetch close status alongside getDayReview**

```tsx
import { loadDayCloseStatus } from "@/lib/day-review/close-status";
import { DayCloseChecklist } from "../day-close/DayCloseChecklist";

// inside page, parallel fetch:
const [payload, closeStatus] = await Promise.all([
  getDayReview(session.accountId, date),
  loadDayCloseStatus(session, date),
]);
```

- [ ] **Step 2: Layout order**

```tsx
<PageHeader title="Day Review" subtitle={...} />
{closeStatus && (
  <DayCloseChecklist
    businessDayId={payload.businessDayId}
    dayStatus={payload.status}
    closedAt={payload.closedAt}
    initial={closeStatus}
  />
)}
<details>
  <summary>Today's details</summary>
  <VisitsSection ... />
  <TimeSection ... />
  <MileageSection ... />
</details>
```

Remove standalone `CloseButton` at bottom — it lives inside `DayCloseChecklist`.

- [ ] **Step 3: Run gate:fast**

```bash
pnpm gate:fast
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/app/day-review/page.tsx
git commit -m "feat(day-review): checklist-first close flow"
```

---

### Task 5: Declutter My Work + BusinessDayBar

**Files:**
- Modify: `apps/web/app/app/my-day/MyDayMobileLayout.tsx`
- Modify: `apps/web/app/app/BusinessDayBar.tsx`

- [ ] **Step 1: Remove BusinessDayBar from MyDayMobileLayout**

Delete:
```tsx
{complete && <BusinessDayBar />}
```
And remove unused `BusinessDayBar` import.

My Work keeps: Start/Continue, ClockBar, End My Day, Manage day accordion.

- [ ] **Step 2: Strip honor checkbox block from BusinessDayBar**

Remove `CLOSE_CHECKLIST`, `checked` state, and the `READY_TO_CLOSE` checklist UI block (lines ~209–231). Keep status display + Open Day / Back to active / Reopen for surfaces that still use `BusinessDayBar` (non-my_day `WorkdayPanel` header).

Remove **Mark day ready to close** button — Day Review close handles transition.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/app/my-day/MyDayMobileLayout.tsx apps/web/app/app/BusinessDayBar.tsx
git commit -m "fix(my-work): remove honor-system close checklist from field surface"
```

---

### Task 6: WorkdayPanel end-day → Day Review

**Files:**
- Modify: `apps/web/app/app/WorkdayPanel.tsx`

- [ ] **Step 1: Replace end_day tab body with CTA**

When `activeTab === "end_day"`, render:

```tsx
<Card>
  <p>Review and close your day on the Day Review screen.</p>
  <Link href="/app/day-review" className="p7-btn p7-btn-primary">Open Day Review</Link>
</Card>
```

Remove duplicate end-day checklist cards (~lines 737–840) to avoid two implementations.

Keep stepper tab label "Review & Close Day" — it now deep-links conceptually.

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/app/WorkdayPanel.tsx
git commit -m "refactor(workday): end-day tab links to Day Review"
```

---

### Task 7: E2E + final verification

**Files:**
- Modify: `tests/e2e/day-review.spec.ts`

- [ ] **Step 1: Add checklist assertion**

```ts
test("shows close checklist on day review", async ({ page }) => {
  await page.goto(`${BASE}/app/day-review`);
  await expect(page.getByText("Payroll")).toBeVisible();
  await expect(page.getByRole("button", { name: /Close Day/i })).toBeVisible();
});
```

- [ ] **Step 2: Run full gate**

```bash
pnpm gate:fast
```

- [ ] **Step 3: PR**

```bash
git checkout -b feat/day-close-checklist
git push -u origin feat/day-close-checklist
gh pr create --title "feat(day-close): actionable Day Review checklist" --body "Implements docs/superpowers/specs/2026-07-03-day-close-checklist-design.md"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| C1 — Day Review owns ritual | 4, 6 |
| My Work lean (no checklist) | 5 |
| No My Work banner v1 | (omitted by design) |
| Notes soft prompt | 1, 3 |
| Auto-detected status | 1, 2 |
| Hard blockers gate Close | 1, 3 |
| Reuse WorkdayPanel actions | 3 |
| Collapsed detail sections | 4 |
| No new API routes | ✓ (uses existing endpoints) |

## Deferred (not in this plan)

- My Work blocker banner ("N items left")
- Server-persisted notes acknowledgment
- Owner-only warnings (draft invoices, deposits) in checklist