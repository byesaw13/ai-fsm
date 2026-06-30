# My Day Mobile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/app/my-day` for mobile so day-start is one guided wizard, the next visit offers Navigate/Call/Start Job in one tap each, quick actions are visible, and the page never scrolls horizontally on a 375px phone.

**Architecture:** Extract pure helpers to `lib/my-day/` for vitest coverage; add four focused client components under `my-day/`; recompose `page.tsx` mobile layout; collapse full `WorkdayPanel` behind "Manage day"; fix overflow at the CSS + component level. Reuse existing APIs — no schema changes.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, vitest (unit), Playwright (e2e), existing `@/components/ui` design system (Forest & Cedar / Dovetails FSM).

## Global Constraints

- No page-level horizontal scroll at **375px width** (`overflow-x: hidden` on `.p7-main` and `.p7-page-container` at `<768px`).
- Touch targets **≥ 44px** on hero buttons, wizard CTAs, and quick-action chips.
- Forest accent **≤ 10%** of screen; status colors never decorative (per `apps/web/DESIGN.md`).
- Start/Complete Job visible for **`tech` and `owner`** field roles (API already allows owner).
- Business day open/close stays in **Manage day**, not the morning wizard.
- Hide `FloatingActionButton` on `/app/my-day` (dedupe with quick-action grid).
- No schema migration; add `c.phone AS client_phone` to existing visit query only.

---

## File Map

| File | Responsibility |
|---|---|
| `apps/web/lib/my-day/visit-hero.ts` | Pure: hero visit selection, maps/tel URLs, action labels |
| `apps/web/lib/my-day/day-setup.ts` | Pure: 3-step day-start completion derivation |
| `apps/web/lib/my-day/__tests__/visit-hero.unit.test.ts` | Unit tests for visit-hero |
| `apps/web/lib/my-day/__tests__/day-setup.unit.test.ts` | Unit tests for day-setup |
| `apps/web/app/app/my-day/NextVisitHero.tsx` | Hero card UI |
| `apps/web/app/app/my-day/FieldQuickActions.tsx` | Wrapping quick-action grid |
| `apps/web/app/app/my-day/DayStatusPill.tsx` | Collapsed day-start summary |
| `apps/web/app/app/my-day/StartMyDayWizard.tsx` | Bottom-sheet wizard |
| `apps/web/app/app/my-day/MyDayMobileLayout.tsx` | Client wrapper: wizard, hero, quick actions, manage-day accordion |
| `apps/web/app/app/my-day/page.tsx` | Server: extended query, pass props, render layout |
| `apps/web/app/app/my-day/MyDayView.tsx` | Visit list minus hero; field-role start/complete |
| `apps/web/app/app/WorkdayPanel.tsx` | Mobile stepper variant; optional `compact` prop |
| `apps/web/app/app/BusinessDayBar.tsx` | Short mobile status label |
| `apps/web/app/app/ActivityTracker.tsx` | Contain chip scroll region |
| `apps/web/components/AppShell.tsx` | Hide FAB on my-day |
| `apps/web/app/styles/layout.css` | Mobile overflow guards |
| `apps/web/app/styles/my-day.css` | My Day layout utilities (import in layout) |
| `tests/e2e/my-day-mobile.spec.ts` | Playwright mobile overflow + hero smoke |

---

### Task 1: Mobile overflow fixes

**Files:**
- Modify: `apps/web/app/styles/layout.css`
- Create: `apps/web/app/styles/my-day.css`
- Modify: `apps/web/app/app/WorkdayPanel.tsx`
- Modify: `apps/web/app/app/BusinessDayBar.tsx`
- Modify: `apps/web/app/app/ActivityTracker.tsx`
- Modify: `apps/web/app/app/layout.tsx` (or global styles entry — add `my-day.css` import)

**Interfaces:**
- Produces: CSS classes `.my-day-stepper-vertical`, `.my-day-contained-scroll`; mobile overflow guards on `.p7-main` / `.p7-page-container`.

- [ ] **Step 1: Add mobile overflow guards to layout.css**

In `apps/web/app/styles/layout.css`, inside the existing `@media (max-width: 767px)` block, add:

```css
  .p7-main,
  .p7-page-container {
    overflow-x: hidden;
    max-width: 100%;
  }
```

- [ ] **Step 2: Create my-day.css utilities**

Create `apps/web/app/styles/my-day.css`:

```css
/* My Day mobile layout utilities */

.my-day-stepper-vertical {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.my-day-stepper-vertical .stepper-item {
  min-width: 0;
  width: 100%;
  flex: none;
}

.my-day-contained-scroll {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.my-day-action-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  width: 100%;
}

.my-day-action-row > a,
.my-day-action-row > button {
  min-height: 44px;
}

.my-day-quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  width: 100%;
}

.my-day-quick-grid > a {
  min-height: 44px;
}

@media (min-width: 768px) {
  .my-day-mobile-only { display: none; }
}
```

Import in the app global styles entry (same place `layout.css` is imported):

```css
@import "./my-day.css";
```

- [ ] **Step 3: WorkdayPanel — vertical stepper on mobile**

In `WorkdayPanel.tsx`, update the inline `<style>` block. Replace the `.workflow-stepper` rules with:

```css
        .workflow-stepper {
          display: flex;
          gap: var(--space-3);
          align-items: stretch;
          width: 100%;
          padding-bottom: var(--space-2);
          border-bottom: 1px solid var(--border);
          margin-bottom: var(--space-4);
        }
        @media (max-width: 767px) {
          .workflow-stepper {
            flex-direction: column;
            overflow-x: visible;
          }
          .workflow-stepper .stepper-item {
            min-width: 0;
            width: 100%;
            flex: none;
          }
        }
        @media (min-width: 768px) {
          .workflow-stepper {
            overflow-x: auto;
            align-items: center;
          }
          .workflow-stepper .stepper-item {
            flex: 1;
            min-width: 160px;
          }
        }
```

Remove the old standalone `.stepper-item { min-width: 160px; flex: 1; }` that applied at all breakpoints.

- [ ] **Step 4: BusinessDayBar — short mobile label**

In `BusinessDayBar.tsx`, replace the status line inside the render (around line 153–156):

```tsx
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", overflowWrap: "anywhere" }}>
          {day === null
            ? "Not opened yet"
            : (
              <>
                <span className="my-day-mobile-only">{STATUS_LABEL[day.status]}</span>
                <span className="my-day-desktop-only" style={{ display: "none" }}>
                  {`${STATUS_LABEL[day.status]}${day.status === "CLOSED" ? "" : " — closing a trip or stopping the timer won't close it"}`}
                </span>
              </>
            )}
        </div>
```

Add to `my-day.css`:

```css
@media (min-width: 768px) {
  .my-day-mobile-only { display: none; }
  .my-day-desktop-only { display: inline !important; }
}
@media (max-width: 767px) {
  .my-day-desktop-only { display: none !important; }
}
```

- [ ] **Step 5: ActivityTracker — contain chip scroll**

In `ActivityTracker.tsx`, find the quick-switch chips container (`data-testid="quick-switch-chips"`). Change:

```tsx
style={{ display: "flex", gap: "var(--space-2)", overflowX: "auto", paddingBottom: 2, margin: "0 -4px" }}
```

to:

```tsx
className="my-day-contained-scroll chips-scroll"
style={{ display: "flex", gap: "var(--space-2)", paddingBottom: 2, margin: 0 }}
```

- [ ] **Step 6: WorkdayPanel vehicle ribbon — stack on mobile**

In `WorkdayPanel.tsx`, vehicle ribbon span (~line 645–649), wrap the muted metadata in a block that stacks:

```tsx
<span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", display: "block", overflowWrap: "anywhere" }}>
  {openSession.vehicle_plate ? <>Plate: <span style={{ fontFamily: "var(--font-mono), 'SF Mono', monospace", fontWeight: 500 }}>{openSession.vehicle_plate}</span> · </> : null}
  Started: <span style={{ fontFamily: "var(--font-mono), 'SF Mono', monospace", fontWeight: 600 }}>{fmtOdo(openSession.start_odometer)}</span> mi
</span>
```

- [ ] **Step 7: Run typecheck**

```bash
cd /home/nick/ai-fsm-deploy-clean && pnpm --filter @ai-fsm/web typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/styles/layout.css apps/web/app/styles/my-day.css \
  apps/web/app/app/WorkdayPanel.tsx apps/web/app/app/BusinessDayBar.tsx \
  apps/web/app/app/ActivityTracker.tsx
git commit -m "fix(my-day): stop mobile horizontal overflow on field surface"
```

---

### Task 2: Visit hero helpers + NextVisitHero

**Files:**
- Create: `apps/web/lib/my-day/visit-hero.ts`
- Create: `apps/web/lib/my-day/__tests__/visit-hero.unit.test.ts`
- Create: `apps/web/app/app/my-day/NextVisitHero.tsx`
- Modify: `apps/web/app/app/my-day/page.tsx`
- Modify: `apps/web/app/app/my-day/MyDayView.tsx`

**Interfaces:**
- Produces:
  - `export type HeroVisit = { id: string; status: string; scheduled_start: string; job_title: string | null; property_address: string | null; client_name: string | null; client_phone: string | null; }`
  - `export function pickHeroVisit<T extends HeroVisit>(visits: T[], nowMs?: number): T | null`
  - `export function buildMapsUrl(address: string | null | undefined): string | null`
  - `export function buildTelUrl(phone: string | null | undefined): string | null`
  - `export function heroPrimaryAction(status: string): "start" | "complete" | null`
  - `export function excludeHeroVisit<T extends { id: string }>(visits: T[], heroId: string | null): T[]`

- [ ] **Step 1: Write failing unit tests**

Create `apps/web/lib/my-day/__tests__/visit-hero.unit.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  pickHeroVisit,
  buildMapsUrl,
  buildTelUrl,
  heroPrimaryAction,
  excludeHeroVisit,
} from "../visit-hero";

const base = {
  job_title: "Fix faucet",
  property_address: "123 Oak St",
  client_name: "Smith",
  client_phone: "5551234567",
};

describe("pickHeroVisit", () => {
  const now = new Date("2026-06-30T10:00:00Z").getTime();

  it("prefers active in_progress over scheduled", () => {
    const visits = [
      { id: "a", status: "scheduled", scheduled_start: "2026-06-30T11:00:00Z", ...base },
      { id: "b", status: "in_progress", scheduled_start: "2026-06-30T09:00:00Z", ...base },
    ];
    expect(pickHeroVisit(visits, now)?.id).toBe("b");
  });

  it("prefers overdue scheduled over future scheduled", () => {
    const visits = [
      { id: "a", status: "scheduled", scheduled_start: "2026-06-30T11:00:00Z", ...base },
      { id: "b", status: "scheduled", scheduled_start: "2026-06-30T08:00:00Z", ...base },
    ];
    expect(pickHeroVisit(visits, now)?.id).toBe("b");
  });

  it("returns null when no pending visits", () => {
    expect(pickHeroVisit([], now)).toBeNull();
  });
});

describe("buildMapsUrl", () => {
  it("returns encoded maps url", () => {
    expect(buildMapsUrl("123 Oak St")).toBe(
      "https://maps.google.com/maps?q=123%20Oak%20St"
    );
  });
  it("returns null for empty", () => {
    expect(buildMapsUrl(null)).toBeNull();
    expect(buildMapsUrl("  ")).toBeNull();
  });
});

describe("buildTelUrl", () => {
  it("returns tel link", () => {
    expect(buildTelUrl("555-123-4567")).toBe("tel:5551234567");
  });
  it("returns null for empty", () => {
    expect(buildTelUrl(null)).toBeNull();
  });
});

describe("heroPrimaryAction", () => {
  it("start for scheduled", () => {
    expect(heroPrimaryAction("scheduled")).toBe("start");
  });
  it("complete for arrived and in_progress", () => {
    expect(heroPrimaryAction("arrived")).toBe("complete");
    expect(heroPrimaryAction("in_progress")).toBe("complete");
  });
  it("null for completed", () => {
    expect(heroPrimaryAction("completed")).toBeNull();
  });
});

describe("excludeHeroVisit", () => {
  it("removes hero id from list", () => {
    const visits = [{ id: "a" }, { id: "b" }];
    expect(excludeHeroVisit(visits, "a")).toEqual([{ id: "b" }]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web && pnpm test:unit lib/my-day/__tests__/visit-hero.unit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement visit-hero.ts**

Create `apps/web/lib/my-day/visit-hero.ts`:

```typescript
export type HeroVisit = {
  id: string;
  status: string;
  scheduled_start: string;
  job_title: string | null;
  property_address: string | null;
  client_name: string | null;
  client_phone: string | null;
};

function isOverdueScheduled(visit: HeroVisit, nowMs: number): boolean {
  return visit.status === "scheduled" && new Date(visit.scheduled_start).getTime() < nowMs;
}

function priority(visit: HeroVisit, nowMs: number): number {
  if (visit.status === "in_progress" || visit.status === "arrived") return 0;
  if (isOverdueScheduled(visit, nowMs)) return 1;
  if (visit.status === "scheduled") return 2;
  return 99;
}

export function pickHeroVisit<T extends HeroVisit>(visits: T[], nowMs = Date.now()): T | null {
  const pending = visits.filter((v) => v.status !== "completed" && v.status !== "cancelled");
  if (pending.length === 0) return null;
  return [...pending].sort((a, b) => {
    const pa = priority(a, nowMs);
    const pb = priority(b, nowMs);
    if (pa !== pb) return pa - pb;
    return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime();
  })[0];
}

export function buildMapsUrl(address: string | null | undefined): string | null {
  const trimmed = address?.trim();
  if (!trimmed) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(trimmed)}`;
}

export function buildTelUrl(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:${digits}`;
}

export function heroPrimaryAction(status: string): "start" | "complete" | null {
  if (status === "scheduled") return "start";
  if (status === "arrived" || status === "in_progress") return "complete";
  return null;
}

export function excludeHeroVisit<T extends { id: string }>(visits: T[], heroId: string | null): T[] {
  if (!heroId) return visits;
  return visits.filter((v) => v.id !== heroId);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web && pnpm test:unit lib/my-day/__tests__/visit-hero.unit.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Create NextVisitHero.tsx**

Create `apps/web/app/app/my-day/NextVisitHero.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, useToast } from "@/components/ui";
import {
  buildMapsUrl,
  buildTelUrl,
  heroPrimaryAction,
  type HeroVisit,
} from "@/lib/my-day/visit-hero";

async function transitionVisit(visitId: string, targetStatus: string): Promise<string | null> {
  const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: targetStatus }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return data.error?.message ?? "Could not update status";
  return null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function NextVisitHero({ visit }: { visit: HeroVisit }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const mapsUrl = buildMapsUrl(visit.property_address);
  const telUrl = buildTelUrl(visit.client_phone);
  const action = heroPrimaryAction(visit.status);

  async function handlePrimary() {
    if (!action) return;
    setPending(true);
    const target = action === "start" ? "arrived" : "completed";
    const err = await transitionVisit(visit.id, target);
    setPending(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success(action === "start" ? "Job started — on site" : "Visit completed");
    router.refresh();
  }

  const btnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--space-3)",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--text-sm)",
    fontWeight: 700,
    textDecoration: "none",
    minHeight: 44,
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--fg)",
    cursor: "pointer",
  };

  return (
    <Card padding="sm" data-testid="next-visit-hero">
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        Next visit · {formatTime(visit.scheduled_start)}
      </div>
      <div style={{ fontWeight: 700, fontSize: "var(--text-lg)", overflowWrap: "anywhere" }}>
        {visit.job_title ?? "Untitled job"}
      </div>
      {visit.client_name && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>{visit.client_name}</div>
      )}
      {visit.property_address && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-secondary)", overflowWrap: "anywhere", marginTop: 4 }}>
          {visit.property_address}
        </div>
      )}
      <div className="my-day-action-row" style={{ marginTop: "var(--space-3)" }}>
        {mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={btnStyle} data-testid="hero-navigate">
            Navigate
          </a>
        ) : (
          <button type="button" disabled style={{ ...btnStyle, opacity: 0.5 }} title="No address on file">
            Navigate
          </button>
        )}
        {telUrl ? (
          <a href={telUrl} style={btnStyle} data-testid="hero-call">
            Call
          </a>
        ) : (
          <button type="button" disabled style={{ ...btnStyle, opacity: 0.5 }} title="No phone on file">
            Call
          </button>
        )}
        {action ? (
          <button
            type="button"
            onClick={handlePrimary}
            disabled={pending}
            data-testid="hero-start-job"
            style={{
              ...btnStyle,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
            }}
          >
            {pending ? "…" : action === "start" ? "Start Job" : "Complete Job"}
          </button>
        ) : (
          <button type="button" disabled style={{ ...btnStyle, opacity: 0.5 }}>
            —
          </button>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 6: Extend page.tsx query and compute hero**

In `page.tsx`, add to the SELECT list:

```sql
c.phone AS client_phone,
```

After `pendingToday` is computed, import and use helpers:

```typescript
import { pickHeroVisit, excludeHeroVisit } from "@/lib/my-day/visit-hero";
import { NextVisitHero } from "./NextVisitHero";
```

```typescript
const heroVisit = pickHeroVisit(pendingToday, now.getTime());
const listVisits = excludeHeroVisit(pendingToday, heroVisit?.id ?? null);
```

Pass `listVisits` to `MyDayView` instead of `pendingToday`. Render hero before WorkdayPanel (temporary — Task 4 moves it into `MyDayMobileLayout`):

```tsx
{heroVisit && (
  <div style={{ marginBottom: "var(--space-4)" }}>
    <NextVisitHero visit={heroVisit} />
  </div>
)}
```

- [ ] **Step 7: MyDayView — field roles get start/complete, not tech-only**

In `MyDayView.tsx`, replace:

```typescript
const isTech = role === "tech";
const canStart = isTech && visit.status === "scheduled";
const canComplete = isTech && (visit.status === "arrived" || visit.status === "in_progress");
```

with:

```typescript
const isFieldRole = role === "tech" || role === "owner";
const canStart = isFieldRole && visit.status === "scheduled";
const canComplete = isFieldRole && (visit.status === "arrived" || visit.status === "in_progress");
```

Replace `{isTech && (` with `{isFieldRole && (` for action buttons block.

Replace `{!isTech && (` owner "View details" fallback — keep only for `admin` if ever shown, or remove entirely since admin redirects away from my-day.

- [ ] **Step 8: Run unit + typecheck**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web && pnpm test:unit lib/my-day/__tests__/visit-hero.unit.test.ts
pnpm --filter @ai-fsm/web typecheck
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/my-day/ apps/web/app/app/my-day/NextVisitHero.tsx \
  apps/web/app/app/my-day/page.tsx apps/web/app/app/my-day/MyDayView.tsx
git commit -m "feat(my-day): next visit hero with navigate, call, and start job"
```

---

### Task 3: Field quick actions + hide FAB

**Files:**
- Create: `apps/web/app/app/my-day/FieldQuickActions.tsx`
- Modify: `apps/web/app/app/my-day/page.tsx`
- Modify: `apps/web/components/AppShell.tsx`
- Modify: `apps/web/lib/navigation/__tests__/quick-actions.unit.test.ts` (optional assertion)

**Interfaces:**
- Consumes: `FIELD_QUICK_ACTIONS` from `@/lib/navigation/quick-actions`
- Produces: `<FieldQuickActions />` rendered on my-day page

- [ ] **Step 1: Create FieldQuickActions.tsx**

```tsx
import Link from "next/link";
import type { Route } from "next";
import { SectionHeader } from "@/components/ui";
import { FIELD_QUICK_ACTIONS } from "@/lib/navigation/quick-actions";

export function FieldQuickActions() {
  return (
    <section data-testid="field-quick-actions">
      <SectionHeader title="Quick Actions" as="h3" />
      <div className="my-day-quick-grid" style={{ marginTop: "var(--space-3)" }}>
        {FIELD_QUICK_ACTIONS.map((act) => (
          <Link
            key={act.label}
            href={act.href as Route}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "var(--space-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              color: "inherit",
              background: "var(--bg-card)",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 18 }}>{act.icon}</span>
            <span>{act.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Render on page.tsx**

After `NextVisitHero` block, add:

```tsx
<div style={{ marginBottom: "var(--space-6)" }}>
  <FieldQuickActions />
</div>
```

- [ ] **Step 3: Hide FAB on my-day in AppShell.tsx**

Change line ~415 from:

```tsx
{isAdminOrOwner && <FloatingActionButton />}
```

to:

```tsx
{isAdminOrOwner && !pathname.startsWith("/app/my-day") && <FloatingActionButton />}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/app/my-day/FieldQuickActions.tsx \
  apps/web/app/app/my-day/page.tsx apps/web/components/AppShell.tsx
git commit -m "feat(my-day): field quick actions grid, hide duplicate FAB"
```

---

### Task 4: Day setup helpers + Start My Day wizard + Manage day

**Files:**
- Create: `apps/web/lib/my-day/day-setup.ts`
- Create: `apps/web/lib/my-day/__tests__/day-setup.unit.test.ts`
- Create: `apps/web/app/app/my-day/DayStatusPill.tsx`
- Create: `apps/web/app/app/my-day/StartMyDayWizard.tsx`
- Create: `apps/web/app/app/my-day/MyDayMobileLayout.tsx`
- Modify: `apps/web/app/app/my-day/page.tsx`

**Interfaces:**
- Produces:
  - `export type DaySetupStep = "clock" | "vehicle" | "mileage"`
  - `export type DaySetupState = { clockedIn: boolean; hasOpenSession: boolean; vehicleReady: boolean }`
  - `export function isDaySetupComplete(state: DaySetupState): boolean`
  - `export function nextIncompleteStep(state: DaySetupState): DaySetupStep | null`
  - `<MyDayMobileLayout>` props: `{ openSession, vehicles, dayMileage, yesterdayMiles, todayLabel, activityEntries, heroVisit, children }`

- [ ] **Step 1: Write failing day-setup tests**

Create `apps/web/lib/my-day/__tests__/day-setup.unit.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isDaySetupComplete, nextIncompleteStep } from "../day-setup";

describe("day-setup", () => {
  it("complete when all three true", () => {
    expect(isDaySetupComplete({ clockedIn: true, hasOpenSession: true, vehicleReady: true })).toBe(true);
  });
  it("incomplete when clock missing", () => {
    expect(isDaySetupComplete({ clockedIn: false, hasOpenSession: true, vehicleReady: true })).toBe(false);
  });
  it("next step is clock first", () => {
    expect(nextIncompleteStep({ clockedIn: false, hasOpenSession: false, vehicleReady: false })).toBe("clock");
  });
  it("next step is vehicle when clocked in", () => {
    expect(nextIncompleteStep({ clockedIn: true, hasOpenSession: false, vehicleReady: false })).toBe("vehicle");
  });
  it("next step is mileage when vehicle ready", () => {
    expect(nextIncompleteStep({ clockedIn: true, hasOpenSession: false, vehicleReady: true })).toBe("mileage");
  });
  it("null when complete", () => {
    expect(nextIncompleteStep({ clockedIn: true, hasOpenSession: true, vehicleReady: true })).toBeNull();
  });
});
```

- [ ] **Step 2: Implement day-setup.ts**

```typescript
export type DaySetupStep = "clock" | "vehicle" | "mileage";

export type DaySetupState = {
  clockedIn: boolean;
  hasOpenSession: boolean;
  vehicleReady: boolean;
};

export function isDaySetupComplete(state: DaySetupState): boolean {
  return state.clockedIn && state.hasOpenSession && state.vehicleReady;
}

export function nextIncompleteStep(state: DaySetupState): DaySetupStep | null {
  if (!state.clockedIn) return "clock";
  if (!state.vehicleReady) return "vehicle";
  if (!state.hasOpenSession) return "mileage";
  return null;
}
```

- [ ] **Step 3: Run day-setup tests**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web && pnpm test:unit lib/my-day/__tests__/day-setup.unit.test.ts
```

Expected: PASS.

- [ ] **Step 4: Create DayStatusPill.tsx**

```tsx
"use client";

import type { DaySetupState } from "@/lib/my-day/day-setup";

export function DayStatusPill({
  state,
  vehicleLabel,
  milesToday,
  onReopen,
}: {
  state: DaySetupState;
  vehicleLabel: string | null;
  milesToday: number;
  onReopen: () => void;
}) {
  const parts = [
    state.clockedIn ? "Clocked in" : "Not clocked in",
    vehicleLabel ?? "No vehicle",
    `${milesToday} mi today`,
  ];
  return (
    <button
      type="button"
      onClick={onReopen}
      data-testid="day-status-pill"
      style={{
        width: "100%",
        textAlign: "left",
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "var(--accent-subtle)",
        fontSize: "var(--text-sm)",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {parts.join(" · ")}
    </button>
  );
}
```

- [ ] **Step 5: Create StartMyDayWizard.tsx**

Wizard is a client component using a fixed bottom sheet. It embeds:
- Step 1: reuse `ClockBar` (already self-fetching)
- Step 2: vehicle `<select>` + odometer `<input>` (mirror WorkdayPanel start-day fields)
- Step 3: "Start mileage" button calling `POST /api/v1/sessions/start` (same body as WorkdayPanel `postStart`)

Key structure:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClockBar } from "../ClockBar";
import { useToast } from "@/components/ui";
import {
  isDaySetupComplete,
  nextIncompleteStep,
  type DaySetupState,
  type DaySetupStep,
} from "@/lib/my-day/day-setup";
import type { VehicleOption } from "../WorkdayPanel";

const STEPS: { key: DaySetupStep; label: string }[] = [
  { key: "clock", label: "Clock in" },
  { key: "vehicle", label: "Vehicle & odometer" },
  { key: "mileage", label: "Start mileage" },
];

export function StartMyDayWizard({
  open,
  onClose,
  initialState,
  vehicles,
}: {
  open: boolean;
  onClose: () => void;
  initialState: DaySetupState;
  vehicles: VehicleOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState(initialState);
  const [activeStep, setActiveStep] = useState<DaySetupStep>(nextIncompleteStep(initialState) ?? "clock");
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [startOdometer, setStartOdometer] = useState(String(vehicles[0]?.current_odometer ?? ""));
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const refresh = async () => {
      const res = await fetch("/api/v1/time-clock/current");
      const json = await res.json().catch(() => ({}));
      const clockedIn = json.data?.status === "open";
      setState((s) => ({ ...s, clockedIn }));
    };
    void refresh();
    window.addEventListener("ops:refresh", refresh);
    return () => window.removeEventListener("ops:refresh", refresh);
  }, [open]);

  useEffect(() => {
    if (isDaySetupComplete(state)) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  async function startMileage() {
    const odo = Number(startOdometer);
    if (!Number.isInteger(odo) || odo < 0) {
      toast.error("Enter a valid start odometer");
      return;
    }
    setPending(true);
    const res = await fetch("/api/v1/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicle_id: vehicleId || null, start_odometer: odo }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      toast.error(json.error?.message ?? "Could not start session");
      return;
    }
    toast.success("Mileage session started");
    setState((s) => ({ ...s, hasOpenSession: true, vehicleReady: true }));
    window.dispatchEvent(new Event("ops:refresh"));
    router.refresh();
  }

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 500 }}
      />
      <div
        role="dialog"
        aria-label="Start my day"
        data-testid="start-my-day-wizard"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 501,
          background: "var(--bg-card)", borderTopLeftRadius: "var(--radius-lg)",
          borderTopRightRadius: "var(--radius-lg)", padding: "var(--space-4)",
          maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <h2 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-lg)", fontWeight: 700 }}>Start My Day</h2>
        <ol style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {STEPS.map((step) => {
            const done =
              (step.key === "clock" && state.clockedIn) ||
              (step.key === "vehicle" && state.vehicleReady) ||
              (step.key === "mileage" && state.hasOpenSession);
            const current = activeStep === step.key;
            return (
              <li key={step.key}>
                <button
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  style={{
                    width: "100%", textAlign: "left", padding: "var(--space-3)",
                    borderRadius: "var(--radius-md)", border: `1px solid ${current ? "var(--accent)" : "var(--border)"}`,
                    background: current ? "var(--accent-subtle)" : "var(--bg-card)",
                    fontWeight: 600, minHeight: 44,
                  }}
                >
                  {done ? "✓ " : ""}{step.label}
                </button>
              </li>
            );
          })}
        </ol>
        {activeStep === "clock" && <ClockBar />}
        {activeStep === "vehicle" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontWeight: 600, fontSize: "var(--text-sm)" }}>
              Vehicle
              <select value={vehicleId} onChange={(e) => {
                setVehicleId(e.target.value);
                const v = vehicles.find((x) => x.id === e.target.value);
                setStartOdometer(String(v?.current_odometer ?? ""));
              }} style={{ minHeight: 44, padding: "0 var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                <option value="">No vehicle</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nickname}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontWeight: 600, fontSize: "var(--text-sm)" }}>
              Starting odometer (mi)
              <input value={startOdometer} onChange={(e) => setStartOdometer(e.target.value)} inputMode="numeric"
                style={{ minHeight: 44, padding: "0 var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }} />
            </label>
            <button type="button" className="p7-btn p7-btn-secondary" style={{ minHeight: 44 }}
              onClick={() => setState((s) => ({ ...s, vehicleReady: true }))}>
              Continue
            </button>
          </div>
        )}
        {activeStep === "mileage" && (
          <button type="button" className="p7-btn p7-btn-primary" style={{ minHeight: 44, width: "100%" }}
            onClick={startMileage} disabled={pending}>
            {pending ? "Starting…" : "Start mileage session"}
          </button>
        )}
      </div>
    </>
  );
}
```

Export `VehicleOption` type from `WorkdayPanel.tsx` (already exported).

- [ ] **Step 6: Create MyDayMobileLayout.tsx**

Client wrapper composing wizard, pill, hero, quick actions, and collapsed manage-day:

```tsx
"use client";

import { useState } from "react";
import { StartMyDayWizard } from "./StartMyDayWizard";
import { DayStatusPill } from "./DayStatusPill";
import { NextVisitHero } from "./NextVisitHero";
import { FieldQuickActions } from "./FieldQuickActions";
import { WorkdayPanel } from "../WorkdayPanel";
import { isDaySetupComplete, type DaySetupState } from "@/lib/my-day/day-setup";
import type { HeroVisit } from "@/lib/my-day/visit-hero";
import type { OpenSession, VehicleOption } from "../WorkdayPanel";
import type { ActivityEntryDto } from "../ActivityTracker";
import type { DayMileageSummary } from "@/lib/mileage/sessions";

export function MyDayMobileLayout({
  todayLabel,
  openSession,
  vehicles,
  activityEntries,
  dayMileage,
  yesterdayMiles,
  heroVisit,
  clockedIn,
  children,
}: {
  todayLabel: string;
  openSession: OpenSession | null;
  vehicles: VehicleOption[];
  activityEntries: ActivityEntryDto[];
  dayMileage: DayMileageSummary;
  yesterdayMiles: number;
  heroVisit: HeroVisit | null;
  clockedIn: boolean;
  children: React.ReactNode;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const setup: DaySetupState = {
    clockedIn,
    hasOpenSession: !!openSession,
    vehicleReady: !!openSession || vehicles.length > 0,
  };
  const complete = isDaySetupComplete(setup);

  return (
    <>
      {!complete ? (
        <button
          type="button"
          data-testid="start-my-day-button"
          className="p7-btn p7-btn-primary"
          style={{ width: "100%", minHeight: 48, marginBottom: "var(--space-4)", fontWeight: 700 }}
          onClick={() => setWizardOpen(true)}
        >
          Start My Day
        </button>
      ) : (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <DayStatusPill
            state={setup}
            vehicleLabel={openSession?.vehicle_nickname ?? null}
            milesToday={dayMileage.totalMiles}
            onReopen={() => setWizardOpen(true)}
          />
        </div>
      )}

      <StartMyDayWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialState={setup}
        vehicles={vehicles}
      />

      {heroVisit && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <NextVisitHero visit={heroVisit} />
        </div>
      )}

      <div style={{ marginBottom: "var(--space-6)" }}>
        <FieldQuickActions />
      </div>

      {children}

      <details style={{ marginTop: "var(--space-6)" }}>
        <summary style={{ fontWeight: 700, cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
          Manage day
        </summary>
        <div style={{ marginTop: "var(--space-4)" }}>
          <WorkdayPanel
            surface="my_day"
            todayLabel={todayLabel}
            openSession={openSession}
            vehicles={vehicles}
            activityEntries={activityEntries}
            dayMileage={dayMileage}
            yesterdayMiles={yesterdayMiles}
          />
        </div>
      </details>
    </>
  );
}
```

- [ ] **Step 7: Wire page.tsx — fetch clock state server-side**

Add query in `page.tsx` Promise.all:

```typescript
queryForSession<{ status: string }>(session,
  `SELECT status FROM time_clock_entries
   WHERE account_id = $1 AND user_id = $2 AND status = 'open'
   ORDER BY clock_in_at DESC LIMIT 1`,
  [accountId, session.userId]),
```

Derive `clockedIn = clockRows[0]?.status === "open"`.

Replace inline WorkdayPanel + hero + quick actions with:

```tsx
<MyDayMobileLayout
  todayLabel={todayLabel}
  openSession={openSessionRows[0] ?? null}
  vehicles={fieldVehicles}
  activityEntries={fieldActivity}
  dayMileage={dayMileage}
  yesterdayMiles={yesterdayMiles}
  heroVisit={heroVisit}
  clockedIn={clockedIn}
>
  {/* MyDayView or EmptyState */}
</MyDayMobileLayout>
```

Remove the standalone WorkdayPanel block above MyDayView.

- [ ] **Step 8: Run tests + typecheck**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web && pnpm test:unit lib/my-day/
pnpm --filter @ai-fsm/web typecheck
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/my-day/day-setup.ts apps/web/lib/my-day/__tests__/day-setup.unit.test.ts \
  apps/web/app/app/my-day/DayStatusPill.tsx apps/web/app/app/my-day/StartMyDayWizard.tsx \
  apps/web/app/app/my-day/MyDayMobileLayout.tsx apps/web/app/app/my-day/page.tsx
git commit -m "feat(my-day): start my day wizard and collapsed manage day"
```

---

### Task 5: WorkdayPanel cleanup for my_day surface

**Files:**
- Modify: `apps/web/app/app/WorkdayPanel.tsx`

**Interfaces:**
- Consumes: Manage day renders WorkdayPanel inside `<details>` only

- [ ] **Step 1: Hide ClockBar + BusinessDayBar inside WorkdayPanel when surface is my_day**

At top of WorkdayPanel return, wrap:

```tsx
{surface !== "my_day" && (
  <>
    <ClockBar />
    <BusinessDayBar />
  </>
)}
```

Wizard and Manage day own those controls for my_day.

- [ ] **Step 2: Verify mobile stepper is vertical** (Task 1 CSS already applied)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/app/WorkdayPanel.tsx
git commit -m "refactor(my-day): workday panel as manage-day backend only"
```

---

### Task 6: E2E mobile smoke tests

**Files:**
- Create: `tests/e2e/my-day-mobile.spec.ts`

**Interfaces:**
- Consumes: `data-testid` attributes from Tasks 2–4

- [ ] **Step 1: Write Playwright spec**

Create `tests/e2e/my-day-mobile.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
const OWNER_EMAIL = "owner@test.com";
const OWNER_PASSWORD = "password";

test.describe("My Day mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', OWNER_EMAIL);
    await page.fill('[id="password"]', OWNER_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(/\/app\/my-day/);
  });

  test("no horizontal page overflow", async ({ page }) => {
    await page.goto(`${BASE}/app/my-day`);
    const overflow = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(overflow.sw).toBeLessThanOrEqual(overflow.cw + 1);
  });

  test("start my day entry visible", async ({ page }) => {
    await page.goto(`${BASE}/app/my-day`);
    const startBtn = page.getByTestId("start-my-day-button");
    const statusPill = page.getByTestId("day-status-pill");
    await expect(startBtn.or(statusPill)).toBeVisible();
  });

  test("wizard opens with three steps", async ({ page }) => {
    await page.goto(`${BASE}/app/my-day`);
    const startBtn = page.getByTestId("start-my-day-button");
    if (!(await startBtn.isVisible())) {
      test.skip();
    }
    await startBtn.click();
    await expect(page.getByTestId("start-my-day-wizard")).toBeVisible();
    await expect(page.getByText("Clock in")).toBeVisible();
    await expect(page.getByText("Vehicle & odometer")).toBeVisible();
    await expect(page.getByText("Start mileage")).toBeVisible();
  });

  test("quick actions grid visible", async ({ page }) => {
    await page.goto(`${BASE}/app/my-day`);
    await expect(page.getByTestId("field-quick-actions")).toBeVisible();
    await expect(page.getByText("Log Mileage")).toBeVisible();
  });

  test("FAB hidden on my day", async ({ page }) => {
    await page.goto(`${BASE}/app/my-day`);
    await expect(page.locator(".p7-fab-wrap button[aria-label*='quick actions']")).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run e2e (requires dev server + seeded DB)**

```bash
cd /home/nick/ai-fsm-deploy-clean && pnpm test:e2e tests/e2e/my-day-mobile.spec.ts
```

Expected: PASS (wizard test may skip if day already started in seed — acceptable).

- [ ] **Step 3: Run full gate**

```bash
cd /home/nick/ai-fsm-deploy-clean && pnpm gate:fast
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/my-day-mobile.spec.ts
git commit -m "test(e2e): my day mobile overflow and wizard smoke"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| No horizontal scroll at 375px | Task 1, Task 6 |
| Start My Day wizard (3 steps) | Task 4 |
| Day Status pill | Task 4 |
| Next Visit hero Navigate/Call/Start | Task 2 |
| Owner + tech start/complete | Task 2 |
| `client_phone` query | Task 2 |
| Field quick actions grid | Task 3 |
| Hide FAB on my-day | Task 3 |
| Manage day collapsed WorkdayPanel | Task 4, Task 5 |
| Mobile vertical stepper | Task 1, Task 5 |
| Business day stays in Manage day | Task 4, Task 5 |
| Touch targets ≥ 44px | Tasks 1–4 CSS |
| Unit tests | Tasks 2, 4 |
| E2E overflow test | Task 6 |

## Out of Scope (confirmed deferred)

- Visit detail deep links (Photos tab)
- Merging clock/business-day/mileage backends
- Tech FAB
- Full visit detail redesign