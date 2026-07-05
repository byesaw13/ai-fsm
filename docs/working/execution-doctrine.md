# Execution Doctrine

**Status:** Active  
**Authority:** Layer 5 in the documentation hierarchy. Governs engineering discipline only — not product scope. Product phasing lives in `docs/canonical/ROADMAP.md`.

---

## Problem Statement

Dovetails FSM is the operational backbone for Dovetails Services LLC — intake through paid invoice, with heavy daily use of field surfaces (My Day, visits, mileage, clocking). The codebase has real debt (141 migrations, inline SQL, overlapping pricing paths, large components), but **a greenfield rebuild is explicitly out of scope**.

The actual problem: **the app must work reliably every day**, and cleanliness should improve incrementally without a parallel codebase, migration squash, or scope-expanding EPICs.

---

## Demand Evidence

- **Active operational dependency:** Recent commits ship My Work, work-order-centric field model, activity timeline, location/day review — the business runs on this app today.
- **Live pain:** Field start-day mileage and clocking must work — field ops cannot wait for a rebuild.
- **Explicit rejection of rebuild:** Founder directive — "I really don't want to rebuild anything. I just want a clean app that works."
- **Priority ordering:** Both matter; **working without surprises comes first** (A before B).

---

## Status Quo

**Current workflow the business lives in:**

```text
Public booking / intake / SMS
  → triage requests
  → client + property
  → estimate (AI-assisted, guardrailed)
  → project approval
  → work order → visit (My Work field execution)
  → invoice + Square payment
  → property history
```

**Current workaround for debt:** Ship features on the existing codebase; tolerate inline SQL and migration sprawl; fix bugs in place (e.g., My Day modal stacking, start-day flow).

**Cost of status quo:** Every change risks touching 165 API routes with ad-hoc SQL; god components (`WorkdayPanel` ~990 lines) slow edits; three pricing paths create confusion on touch. Manageable if debt is paid **on contact only**.

---

## Target User & Narrowest Wedge

| Role | Daily need | Wedge priority |
|------|------------|----------------|
| **Owner** | Dashboard, action queue, pricing approval, day close | P1 after field stable |
| **Office/Admin** | Clients, estimates, invoices, scheduling | P1 — revenue spine |
| **Technician** | My Day: start day → assigned visits → clock/mileage → complete | **P0 — fix now** |

**Narrowest wedge (ROADMAP Phase 0):** Technician can start the day (odometer + clock), execute assigned work orders/visits, and close the day without modal dead-ends or blocked flows.

**Not the wedge:** Migration squash, `packages/db` extraction, portal expansion, membership subsystem growth, Production Intelligence expansion.

---

## Premises (confirmed)

1. **Working beats clean** — ship fixes before structural refactors.
2. **"Clean" = trustworthy daily use first**, codebase feel second.
3. **Current repo is the only product** — no parallel app, no cutover.
4. **Debt paid on contact** — no dedicated "cleanup sprint" that blocks features.
5. **Scope freeze** — no new EPICs until ROADMAP Phase 0 + Phase 1 are boringly reliable.

---

## Approaches Considered

### Approach A: Stabilize First
- Fix broken flows only; zero structural change.
- Effort S | Risk Low
- Rejected as sole path: stops the bleeding but doesn't address "clean" feel.

### Approach B: Works + Stop the Bleeding ✅ RECOMMENDED
- Stabilize P0 field flows, then three standing rules for incremental cleanliness.
- Effort M | Risk Low
- Balances "works first" with "codebase stops feeling like a trap."

### Approach C: Strangler Without Rebuild
- Incremental `packages/db`, module-by-module repository layer.
- Effort L | Risk Med
- Deferred until Approach B rules prove insufficient (inline SQL blocking every change).

---

## Recommended Approach: B with A-then-B sequencing

### ROADMAP Phase 0 — Works (immediate, days)

**Goal:** Field ops boringly reliable.

| Task | Source |
|------|--------|
| Land My Work field tools (modal stacking, start-day mileage + clock) | Active branches |
| Run `pnpm gate:fast` before merge; `pnpm gate` if field paths touched | Quality gates |
| Smoke-verify: start day → view work order → clock activity → end day review | Manual + E2E (`my-day-mobile`, `day-review`) |

**Definition of done:** Owner/tech can run a full field day without workaround or blocked UI.

### Stop the Bleeding (ongoing rules)

Three standing rules — no sprint required:

**Rule 1: Scope freeze**
- No new tables, routes, or EPICs unless they fix a P0 field or revenue-spine bug, per `docs/canonical/ROADMAP.md` out-of-scope list.
- Canonical docs (`docs/canonical/*`) must be updated before any new durable noun.

**Rule 2: New code, new patterns**
- New API routes: SQL lives in `lib/db/<domain>.ts` helpers, not in route handlers.
- New UI: colocate in `components/features/<domain>/`, not in `app/app/` route folders.
- Existing files: leave alone unless already editing for a feature/fix.

**Rule 3: Retire on touch**
- When editing a file that references: `painting.ts` legacy adapter, Stripe env, duplicate pricing path, or `jobs.scheduled_start/end` — remove or redirect to canonical path in the same PR.
- Split god components only when the PR already touches them (e.g., `WorkdayPanel` → extract subpanels as part of My Day fix).

### Clean on Contact (months, opportunistic)

Trigger `packages/db` extraction (Approach C) **only when**:
- Three consecutive features in the same domain (e.g., visits) each duplicate SQL, OR
- A bug fix requires understanding 4+ route files to find the query.

Until then: `lib/db/` module helpers are sufficient.

---

## Open Questions

1. **Cutover criteria for Approach C:** What specific pain event triggers `packages/db`? Suggest: "same query copied to 3+ routes."
2. **Automation count:** Are all 12 automations actively valued, or can some stay disabled during scope freeze?
3. **E2E in CI:** Only `core-flow` runs in CI — should `my-day-mobile` + `day-review` join smoke on next gate improvement?

---

## Success Criteria

### Works (Phase 0) — measurable within 2 weeks
- [ ] My Day start-day flow completes without blocked modals (mileage + clock)
- [ ] `pnpm gate:fast` green on main
- [ ] `my-day-mobile` + `day-review` E2E pass locally
- [ ] Zero P0 field bugs open for 7 consecutive operating days

### Clean (ongoing) — measurable within 90 days
- [ ] 100% of new API routes use `lib/db/` helpers (grep audit)
- [ ] Zero new raw SQL in `app/api/` route handlers
- [ ] `painting.ts` legacy adapter removed or isolated to zero call sites
- [ ] No new EPIC scope merged without canonical doc update
- [ ] `WorkdayPanel` under 600 lines (via on-contact splits)

---

## Dependencies

| Blocker | Status |
|---------|--------|
| My Work field tools merge | In progress |
| Canonical docs alignment | `docs/canonical/ROADMAP.md` — use as scope gate |
| `docs/generated/REBUILD_AUDIT_REPORT.md` | Inventory reference only — Section 23 blueprint is out of scope |
| Production deploy (`garonhome`) | Unchanged — deploy after gate |

---

## The Assignment

**This week, one thing:**

Finish and merge My Work field tools, then run a real field day on production (or staging): start day with odometer, clock in, open a work order, complete one visit action, open day review. If anything blocks, file it as P0 — nothing else gets worked until that flow is clean.

Do **not** start a new repo, squash migrations, or extract `packages/db` until the assignment passes.