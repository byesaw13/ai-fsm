# Nested Hubs UX (P0 Shell) Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes track progress. Later phases (P1–P4) get their own plans or follow-up PRs; this plan ships the **shell foundation**.

**Goal:** Restructure AppShell into four labeled hubs (Home / Work / People / Money), align mobile bottom tabs, add Breadcrumbs + WhatNext primitives, and keep role/workspace rules intact.

**Architecture:** Pure nav builders in `AppShell.tsx`; presentational UI primitives under `components/ui`; CSS for section labels and sticky field CTA. No new domain objects or API routes.

**Tech Stack:** Next.js App Router, React client shell, existing P7 CSS tokens, Vitest unit tests.

---

## File map

| File | Responsibility |
|---|---|
| `apps/web/components/AppShell.tsx` | Hub sections, bottom nav, shell chrome |
| `apps/web/components/ui/Breadcrumbs.tsx` | Nested trail |
| `apps/web/components/ui/WhatNext.tsx` | Single recommended next step card |
| `apps/web/components/ui/index.ts` | Barrel exports |
| `apps/web/app/styles/layout.css` | Hub section labels, nested indent, sticky CTA helpers |
| `apps/web/components/ui/__tests__/design-system.unit.test.ts` | Nav + new primitive tests |
| `apps/web/app/app/jobs/[id]/page.tsx` (light) | Wire Breadcrumbs + WhatNext if data already present |
| `docs/superpowers/specs/2026-08-01-nested-hubs-ux-design.md` | Spec (already written) |

---

### Task 1: Nav builders — nested hubs

**Files:**
- Modify: `apps/web/components/AppShell.tsx`
- Test: `apps/web/components/ui/__tests__/design-system.unit.test.ts`

- [ ] **Step 1: Write failing tests for hub section labels and bottom tabs**

Expect:

- Admin/owner nav is **multiple labeled sections**: `Home`, `Work`, `People`, `Money` (+ settings section or footer settings).
- Flattened hrefs still include all previous daily-driver destinations (no loss of routes).
- Owner field home is `/app/my-work`; office home is `/app`; never both as homes.
- Admin has no `/app/my-work`.
- Tech remains 3 items: my-work, visits, day-review.
- Bottom nav owner: Home (`/app/my-work`), Work (`/app/jobs`), People (`/app/clients`), Money (`/app/invoices`) — 4 items (+ More in shell).
- Bottom nav admin: Home (`/app`), Work, People, Money.
- Bottom nav tech: My Day + Visits (2 items) — unchanged count.

- [ ] **Step 2: Implement `ADMIN_NAV_SECTIONS` as labeled hubs**

```ts
// Structure (illustrative)
const ADMIN_NAV_SECTIONS: NavSection[] = [
  { label: "Home", items: [/* home + day review */] },
  { label: "Work", items: [/* requests, estimates, jobs, work-orders, schedule */] },
  { label: "People", items: [/* clients, properties */] },
  { label: "Money", items: [/* invoices, reports */] },
  { label: "", items: [/* settings */] },
];
```

`getNavSections` filters My Day vs Overview by role/view as today, but home item lives only in the Home section.

`getBottomNavItems` returns 4 hub shortcuts for owner/admin; tech stays 2.

- [ ] **Step 3: Render section labels in sidebar + More sheet**

Use existing `p7-nav-section` class; ensure empty label hides heading.

- [ ] **Step 4: Run unit tests; commit**

```bash
pnpm --filter @ai-fsm/web exec vitest run components/ui/__tests__/design-system.unit.test.ts
```

---

### Task 2: Breadcrumbs + WhatNext primitives

**Files:**
- Create: `apps/web/components/ui/Breadcrumbs.tsx`
- Create: `apps/web/components/ui/WhatNext.tsx`
- Modify: `apps/web/components/ui/index.ts`
- Test: `design-system.unit.test.ts` (pure helpers if any)

- [ ] **Step 1: Breadcrumbs**

```tsx
export type Crumb = { href?: string; label: string };
export function Breadcrumbs({ items }: { items: Crumb[] }) { /* … */ }
```

- Last crumb is current page (no link).
- Mobile: truncate middle with ellipsis if &gt; 3; keep first + last.

- [ ] **Step 2: WhatNext**

```tsx
export function WhatNext({
  title,
  description,
  href,
  actionLabel,
}: {
  title: string;
  description?: string;
  href: string;
  actionLabel: string;
}) { /* card + primary link button */ }
```

- [ ] **Step 3: Export from barrel; minimal CSS if needed; commit**

---

### Task 3: Wire one T2 surface (Job detail)

**Files:**
- Modify: `apps/web/app/app/jobs/[id]/page.tsx` (or ProjectOverview if cleaner)

- [ ] **Step 1:** Add Breadcrumbs: Clients → Client → Job (use IDs already loaded on the page).
- [ ] **Step 2:** If a clear next action already exists (e.g. schedule visit / open work order), render `WhatNext` once at top or bottom of overview — **no new backend**.
- [ ] **Step 3:** Commit.

---

### Task 4: Layout polish + gate

**Files:**
- Modify: `apps/web/app/styles/layout.css` as needed

- [ ] Nested indent for children under hub labels (optional visual).
- [ ] Sticky field primary helper class if missing: `.p7-sticky-primary`.
- [ ] Run `pnpm gate:fast` (or web unit + typecheck + lint).
- [ ] Commit.

---

### Task 5: Ship

- [ ] Push branch, open PR against `main`.
- [ ] Babysit CI; fix failures.
- [ ] Merge when green.
- [ ] Deploy: `bash scripts/deploy-garonhome.sh` (or project’s standard path on host).

---

## Out of this PR (follow-ups)

- P1 full My Day / Overview content rewrite  
- P2–P4 template application across all lists/editors/boards  
- Hub intermediate “sheet only” routes without a primary list  
- Global search implementation beyond a non-functional slot  

## Spec coverage

| Spec section | Task |
|---|---|
| IA four hubs | Task 1 |
| Shell phone/desktop | Task 1, 4 |
| Minimal-input what-next primitive | Task 2–3 |
| Breadcrumb nest | Task 2–3 |
| Phases P0 | This plan |
| Errors/testing | Task 1 tests + Task 4 gate |
