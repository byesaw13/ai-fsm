# My Work Field Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface mid-day activity switching (B) and odometer checkpoints (C) on My Work without the Manage day accordion; fix broken mobile Dashboard link; declutter the field page.

**Architecture:** New `FieldRightNowCard` composes existing `NowBar` + a compact expandable vehicle row. Odometer checkpoints use a new `POST /api/v1/sessions/:id/checkpoint` endpoint (open session only, no close). Remove `WorkdayPanel` from My Work; trim quick actions and mobile Dashboard button.

**Tech Stack:** Next.js 15 App Router, React client components, PostgreSQL, Vitest, Playwright e2e

**Spec:** `docs/superpowers/specs/2026-07-03-my-work-field-tools-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/app/api/v1/sessions/[id]/checkpoint/route.ts` | Save odometer reading on open session |
| `apps/web/app/api/v1/sessions/__tests__/checkpoint.unit.test.ts` | Checkpoint API tests |
| `apps/web/app/app/my-work/FieldRightNowCard.tsx` | Activity + vehicle rows (B, C, A) |
| `apps/web/app/app/my-work/VehicleRow.tsx` | Collapsed/expanded vehicle UI |
| `apps/web/app/app/my-day/MyDayMobileLayout.tsx` | Render Right now; remove Manage day |
| `apps/web/app/app/my-work/page.tsx` | Hide Dashboard on mobile; Office peek → action queue |
| `apps/web/lib/navigation/quick-actions.ts` | Remove End My Day + Log Mileage duplicates |
| `apps/web/app/styles/my-day.css` | `.field-right-now` spacing utilities |
| `tests/e2e/my-day-mobile.spec.ts` | Right now visible; no Manage day |

---

### Task 1: Odometer checkpoint API

**Files:**
- Create: `apps/web/app/api/v1/sessions/[id]/checkpoint/route.ts`
- Create: `apps/web/app/api/v1/sessions/__tests__/checkpoint.unit.test.ts`

**Contract:**
- `POST /api/v1/sessions/:id/checkpoint` body: `{ odometer: number }` (int, min 1)
- Session must exist, belong to account, be **open** (`end_odometer IS NULL AND miles IS NULL`)
- `odometer` must be `>= start_odometer`
- Append to `notes`: `\n[checkpoint ISO] {odometer} mi` (preserve existing notes)
- Return `{ data: { id, last_checkpoint_odometer, notes } }`
- Does NOT set `end_odometer`, `miles`, or `ended_at`

- [ ] **Step 1: Write failing test**

```ts
// checkpoint.unit.test.ts — follow pattern from open-session.unit.test.ts mocks
it("rejects checkpoint on closed session", async () => { /* ... */ });
it("rejects odometer below start", async () => { /* ... */ });
it("appends checkpoint to notes on open session", async () => { /* ... */ });
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /home/nick/ai-fsm-deploy-clean && pnpm --filter @ai-fsm/web test:unit -- checkpoint.unit
```

- [ ] **Step 3: Implement route** (mirror `[id]/route.ts` RLS transaction pattern)

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sessions): odometer checkpoint on open mileage session"
```

---

### Task 2: FieldRightNowCard + VehicleRow

**Files:**
- Create: `apps/web/app/app/my-work/FieldRightNowCard.tsx`
- Create: `apps/web/app/app/my-work/VehicleRow.tsx`

**FieldRightNowCard props:**
```ts
{
  openSession: OpenSession | null;
  vehicles: VehicleOption[];
  activityEntries: ActivityEntryDto[];
  milesToday: number;
}
```

**Activity section:** Import `NowBar` from `ActivityTracker.tsx`. Derive `active` entry same as WorkdayPanel (`activityEntries.find(e => !e.ended_at)`). `quickTypes={["travel","job_work","material_run","admin","personal"]}`.

**VehicleRow collapsed:** `{nickname} · {milesToday} mi today` or "No mileage session — Start" linking to `StartMyDayWizard` reopen or `/app/mileage`.

**VehicleRow expanded:**
- Odometer input + "Save reading" → `POST .../checkpoint`
- "Switch vehicle" → reuse `POST /api/v1/sessions/switch` (inline mini-form: end odo, new vehicle, new start — copy from WorkdayPanel `beginSwitch`)
- "Close session" link (secondary) → end odometer + `PATCH /api/v1/sessions/:id`

`data-testid="field-right-now"` on wrapper.

- [ ] **Step 1: Create components**

- [ ] **Step 2: Manual smoke** — render in isolation or Storybook N/A; wire in Task 3

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(my-work): FieldRightNowCard with activity and vehicle rows"
```

---

### Task 3: Wire MyDayMobileLayout + declutter

**Files:**
- Modify: `apps/web/app/app/my-day/MyDayMobileLayout.tsx`
- Modify: `apps/web/lib/navigation/quick-actions.ts`
- Modify: `apps/web/app/styles/my-day.css`

- [ ] **Step 1: Add Right now when clockedIn**

```tsx
{clockedIn && (
  <div style={{ marginBottom: "var(--space-4)" }}>
    <FieldRightNowCard
      openSession={openSession}
      vehicles={vehicles}
      activityEntries={activityEntries}
      milesToday={dayMileage.totalMiles}
    />
  </div>
)}
```

Place **after** End My Day block, **before** hero visit.

- [ ] **Step 2: Remove Manage day accordion** — delete `<details>Manage day</details>` and `WorkdayPanel` import.

- [ ] **Step 3: Trim FIELD_QUICK_ACTIONS**

Remove:
- `{ label: "End My Day", ... }` (button above)
- `{ label: "Log Mileage", ... }` (vehicle row covers C)

- [ ] **Step 4: Add `.field-right-now` utility** — card border, gap, mobile padding in `my-day.css`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(my-work): Right now on My Work, remove Manage day accordion"
```

---

### Task 4: Mobile Dashboard + Office peek fix

**Files:**
- Modify: `apps/web/app/app/my-work/page.tsx`

- [ ] **Step 1: Hide Dashboard button on mobile**

Wrap owner header actions:
```tsx
<span className="p7-only-desktop">
  <LinkButton href="/app" variant="secondary" size="sm">← Dashboard</LinkButton>
</span>
```

Keep `ManualSiteVisitButton` visible on all sizes (or mobile-only per existing pattern).

- [ ] **Step 2: Office peek → action queue**

Change `href={"/app" as Route}` to `href={"/app/action-queue" as Route}` on owner peek `Link`.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(my-work): hide mobile Dashboard btn, Office peek to action queue"
```

---

### Task 5: Tests + gate + PR

**Files:**
- Modify: `tests/e2e/my-day-mobile.spec.ts`

- [ ] **Step 1: E2E additions**

```ts
test("field right now visible when clocked in", async ({ page }) => {
  await page.goto(`${BASE}/app/my-work`);
  // If clocked in state exists in seed, assert now-bar or field-right-now
  await expect(page.getByTestId("field-right-now").or(page.getByTestId("start-my-day-button"))).toBeVisible();
});

test("no manage day accordion", async ({ page }) => {
  await page.goto(`${BASE}/app/my-work`);
  await expect(page.getByText("Manage day")).not.toBeVisible();
});
```

- [ ] **Step 2: Unit test quick-actions** — update `quick-actions.unit.test.ts` if label count changes

- [ ] **Step 3: Run gate**

```bash
pnpm gate:fast
```

- [ ] **Step 4: PR**

```bash
git push -u origin feat/my-work-field-tools
gh pr create --title "feat(my-work): Right now card replaces Manage day" --body "Implements docs/superpowers/specs/2026-07-03-my-work-field-tools-design.md"
```

---

## Spec coverage

| Requirement | Task |
|-------------|------|
| B — activity at zero taps | 2, 3 |
| C — odometer anytime | 1, 2 |
| A — switch vehicle | 2 (expanded row) |
| D — office without dashboard | 4 |
| Remove Manage day | 3 |
| Declutter quick actions | 3 |

## Deferred

- Checkpoint history UI (notes are stored; display later)
- Desktop My Work layout changes beyond Dashboard visibility class