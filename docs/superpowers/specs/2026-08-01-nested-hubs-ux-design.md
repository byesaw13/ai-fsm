# Nested Hubs UX System — Design

**Date:** 2026-08-01  
**Status:** Approved  
**Product:** Dovetails FSM (`ai-fsm`)  
**Approach:** Nested hubs (A) — owner hybrid, evolve Forest & Cedar, full-app template system phased

---

## Problem

The app already runs the full residential handyman workflow, but chrome and navigation grew flat and long: many equal-weight destinations, two competing “homes,” and detail pages that don’t consistently guide the next step. Field use needs confirm/correct; office use needs dense lists and nesting. The redesign must stay on the existing codebase (no greenfield rebuild) and cover every screen type over phases.

## Goals

1. **Full UX rethink** of navigation, density, and interaction — not a single feature.
2. **Owner hybrid:** phone defaults to field (My Day); full-screen defaults to office (Overview).
3. **Minimal input:** fewer taps, less typing, less deciding (propose → confirm; gap-fill checklists; one what-next).
4. **Nesting is first-class:** Client → Property → Job → Work order → Visit.
5. **Mobile + full-screen friendly:** same hubs; different density and chrome.
6. **Evolve Forest & Cedar** — same brand DNA, cleaner shell and patterns.

## Non-goals

- New domain objects or workflow steps.
- New AI product surface (AI remains a quiet helper).
- Multi-company / white-label platform.
- One mega-PR that rewrites every page at once.
- Backend contract rewrites unless a thin read model is required for a template.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Scope of rethink | All of: nav, minimal input, modern mobile/fullscreen |
| Primary persona | Owner hybrid (phone field / desktop office) |
| Depth | Every screen via shared templates, phased delivery |
| Visual identity | Evolve Forest & Cedar |
| Minimal input | All three: taps, typing, deciding |
| Shell approach | **A · Nested hubs** (light search on desktop; full-screen field sheets) |

---

## 1. Information architecture

### Four hubs

| Hub | Contents |
|---|---|
| **Home** | Role-adaptive daily surface: phone → My Day (`/app/my-work`); desktop → Overview (`/app`). Day Review. Start/end day orchestration. |
| **Work** | Requests, Estimates, Jobs (projects), Work orders, Schedule/Visits. |
| **People** | Clients → nested Properties → history/vault. |
| **Money** | Invoices, Expenses (when in daily use), Reports. Price book stays Settings-adjacent. |

### Canonical nest

```text
Client → Property → Job → Work order → Visit
```

- Breadcrumbs and back affordances follow this chain.
- Estimates and invoices hang off **Job/Project**, not a parallel tree.
- No new workflow objects — only how existing objects are reached.

### More / Settings

Automations, team, Square, system health, workspace override, materials catalog admin, and other non-daily tools live under More/Settings — reachable, not daily chrome.

### Role rules (unchanged product intent)

- **Tech:** My Day, Visits, Day Review (+ Settings via footer/More). No office hubs as peers.
- **Admin:** No My Day home; Overview leads.
- **Owner:** Single home per mode (field vs office); shared business destinations in both.

---

## 2. Shell & navigation

### Phone (&lt;768px)

- Bottom tabs: **Home · Work · People · Money · More** (exactly the hubs + More).
- Home tab → My Day (owner/tech) or Overview (admin).
- Work / People / Money → primary list route for that hub (Jobs / Clients / Invoices), with full hub children available in More and in nested sidebar on larger screens.
- Critical moments (arrive, closeout, start day) use **full-screen field sheets**; tab bar may hide while the sheet is open.
- Primary action sticky above the tab bar, min height 48px.

### Desktop / full screen (≥768px, optimized ≥1024px)

- Collapsible left sidebar with **labeled hub sections** and nested children under Work / People / Money.
- Main canvas: Overview at Home (office mode).
- Light **search** slot in the main header area (not a command-center takeover).
- Entity pages may use an optional **context rail** (property history / what-next).

### Shell rules

1. One home per device/workspace mode — phone never treats Overview as primary home; desktop never makes My Day the default landing for office work.
2. Nested hub expansion on desktop; flat hub children list in More on phone.
3. Full-screen field sheets when focus matters (T3).
4. Forest accent only for primary/active — green is earned (≤10% of screen).

---

## 3. Minimal-input patterns

### P1 · Propose → Confirm

System drafts the action (arrival match, start day, invoice from visits). One primary **Confirm**; **Edit** when wrong. Field default is confirm, not fill-from-blank.

### P2 · Checklist of done work

Closeout / day review show what is already captured (GPS, photos, OCR, notes). User fills **gaps** only.

### P3 · What-next on every nest

Every Client / Property / Job / Visit (and similar) page ends with **one** recommended next step from workflow state — not a wall of equal buttons.

### Pattern rules

**Do**

- Prefill from GPS, last visit, price book, receipt OCR where already available.
- One forest-green primary per screen.
- Destructive / rare actions in overflow.
- Status pills always label + color.
- Defaults visible; edit optional.

**Don’t**

- Empty forms when a proposal exists.
- Two competing greens.
- Modal stacks deeper than one (use nest or full-screen sheet).
- Re-ask for data the system already has.
- Present AI as the product headline.

---

## 4. Screen templates (every surface)

| ID | Template | Used for |
|---|---|---|
| **T1** | Hub list | Jobs, estimates, invoices, clients, requests… — search, filters, status chips, row → nest |
| **T2** | Nested detail | Client, property, job, work order, visit detail — breadcrumb, what-next, sections/tabs, optional context rail |
| **T3** | Field focus sheet | Arrive, closeout, start day, quick lead — full-screen, huge CTA |
| **T4** | Guided editor | New estimate, invoice, intake — short steps, prefilled, draft always saved |
| **T5** | Ops board / calendar | Schedule, kanban, day map, reports — multi-column desk; day strip / single column phone |

**Settings** = sectioned form under More (T2 without deep entity nest).

Every existing route maps to one template. Implementation is “apply template + wire what-next,” not a unique design per page.

---

## 5. Phased delivery

| Phase | Ships |
|---|---|
| **P0** | Design tokens as needed, AppShell hub sections, bottom tabs, breadcrumbs primitive, search slot, nav unit tests |
| **P1** | Home surfaces (My Day + Overview) chrome aligned to T3 hero + what-needs-you; start-day / arrival sheets stay T3 |
| **P2** | People nest + Work lists as T1/T2; job/visit detail what-next; field focus consistency |
| **P3** | Money lists/details + guided editors (estimate/invoice/intake) propose→confirm handoffs |
| **P4** | Schedule/boards/reports T5, settings polish, a11y/field legibility sweep, dead chrome removal |

This design document covers the full system. Each phase is a separate shippable increment; P0 is the foundation PR for the shell.

---

## 6. Errors, empty states, testing

### Errors / empty

- Proposal fails → short manual path; never a dead end; plain-language reason.
- Offline → queue when already supported; otherwise block Confirm with “No connection” and keep draft.
- Empty lists → one sentence + one primary CTA.
- Wrong proposal → Edit always available.
- Role-gated actions **hidden**, not walls of disabled controls.
- Money/status: same honest labels and colors as product rules today.

### Testing

- **Unit:** hub map, role filtering, bottom nav, `isNavActive`, breadcrumb builders, what-next pickers when introduced.
- **E2E:** retarget existing smokes (`my-day-mobile`, `core-flow`, `tech-smoke`, admin smoke) to new hub labels/routes as needed.
- **Manual per phase:** one-handed CTA size, phone vs desktop home, nest breadcrumbs, one Confirm/Edit path.

### Code touchpoints

- `apps/web/components/AppShell.tsx`
- `apps/web/components/ui/*` (Breadcrumbs, WhatNext, PageHeader)
- `apps/web/app/styles/tokens.css`, `layout.css`, related
- `apps/web/app/app/my-work`, `my-day`, entity pages under `app/app/*`
- Labels/constants from `@ai-fsm/domain`
- Nav tests in `apps/web/components/ui/__tests__/design-system.unit.test.ts`

---

## 7. Architecture notes

- **Stabilize, don’t rebuild** — align with `docs/working/execution-doctrine.md`.
- Navigation is a pure function of `role` + workspace view (`field` | `office`); AppShell remains the single chrome owner.
- What-next logic should be pure functions over existing status fields (domain or thin `lib/` helpers), not new stored workflow stages.
- Breadcrumbs are presentational; they do not invent parent links without real IDs from the page data.

---

## Success criteria

1. Owner on phone lands on My Day; on desktop lands on Overview; hubs are the only primary IA.
2. Sidebar shows nested hub sections; mobile has Home/Work/People/Money/More.
3. Shared primitives exist for breadcrumbs and what-next; used on at least one T2 path in the first shell PR.
4. Existing roles still only see allowed destinations.
5. Unit nav tests pass; gate:fast clean for the change set.
6. Brand remains Forest & Cedar (no identity swap).
