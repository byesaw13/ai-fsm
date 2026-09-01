# Roadmap

## North Star

Reduce product identity drift and strengthen the core residential handyman operating workflow:

```text
Client → Property → Estimate → Project → Work Order → Visit → Invoice → History
```

Backend `jobs` present as **Project** in UI. See `docs/canonical/DOMAIN_MODEL.md` and `docs/canonical/WORKFLOW.md`.

## Execution Principles

These govern *how* work is done. They do not define product scope — phases below do.

| Principle | Rule |
|-----------|------|
| Works before clean | Ship fixes before structural refactors |
| Scope freeze | No new EPICs, tables, or routes until Phase 0 and Phase 1 are boringly reliable |
| Clean on contact | Pay debt only in files already being edited for a feature or fix |
| No rebuild | This repo is the only product; migration squash and greenfield cutover are deferred |
| References over ownership | One source of truth per fact; aggregates hold references, not copies |

Full engineering doctrine: `docs/working/execution-doctrine.md`.

## Phases

| Phase | Name | Status | Scope |
|-------|------|--------|-------|
| **0** | Field Ops Reliability | **Complete** | Technician day flow: start day → clock → work orders → day close (#463, #461, TASK-058/059) |
| **1** | Operations Engine Completion | **Active** | Business Day, activity, vehicle, day close, current ops state per `docs/canonical/OPERATIONS.md`. Location capture, day map, and hybrid tracking are Phase 1 **infrastructure**. |
| **2** | Property-Centered Surfaces | Next | Property history findable from every workflow page; visit evidence promoted to permanent record |
| **3** | Estimate & Billing Closure | Planned | Assessment summary complete; estimate→job handoff explicit; invoice/payment connected to completed work |
| **4** | Production Intelligence | Deferred | Only after Phases 0–3 stable. See `docs/canonical/PRODUCTION_INTELLIGENCE.md` |

### Phase 0 — Field Ops Reliability (complete)

Shipped on main (2026-08):

- Dashboard single-screen merge + burnt-orange rebrand — `/app` Overview now combines the field workday (Start Day, vehicle, mileage) with business widgets on one screen; app rebranded from Forest & Cedar green to burnt-orange to match the marketing site; Archivo web font (#561)

Shipped on main (2026-07):

- My Work field tools — `FieldRightNowCard`, odometer checkpoints, decluttered layout (#463)
- Day close checklist on day review (#461)
- PWA app layer — manifest, icons, service worker (TASK-020); production install requires HTTPS origin (`docs/working/pwa-https-deployment.md`)
- Workspace auto-route by device + Settings override (TASK-058)
- My Day start-surface consolidation — no odometer-unlocks-day framing (TASK-059)

**Validation:** Run one full field day on device; file any blocker as P0 before Phase 1 expansion.

### Phase 1 — Operations Engine Completion (active)

See kickoff plan: `docs/superpowers/plans/2026-07-06-phase-1-operations-kickoff.md`.

Canonical architecture: `docs/canonical/OPERATIONS.md`.

**Priority order:**

1. TASK-056 — Current Operations State: valid transitions + tests; wire into field surfaces
2. TASK-053 — Activity + Assignment model: finish migration 129 consumers
3. TASK-054 — Day Close checklist + Reopen (verify against #461; close gaps)
4. TASK-046 — Location privacy controls (retention pruning, home/private filtering)
5. TASK-050 — Mileage ↔ travel-time link (migration 130)

Location capture, visit candidates, day map, hybrid tracking are **shipped infrastructure** — maintain only, no scope expansion.

**Done when:** Payroll, activity, vehicle, and location concerns are independently lifecyclable; day close does not overload unrelated concerns.

**Phase 1 exception — TASK-115 Promise Capture Pilot.** Authorized 2026-09-01. Adds a capture-evidence table and an additive `action_items.source_capture_id` change so an owner promise recorded on Tuesday still exists on an FSM object on Thursday. This is an explicit exception to the table freeze. It does not open Owner OS, coaching, a second inbox, or a new priority scorer. See `docs/superpowers/specs/2026-09-01-promise-capture-pilot-design.md`.

### Phase 2 — Property-Centered Surfaces

- Property timeline reachable from client, job, visit, estimate, invoice surfaces
- Visit evidence (photos, notes, completion) promoted to permanent property record
- Property opportunities and health records (TASK-011–013) only after Phase 0–1 stable

### Phase 3 — Estimate & Billing Closure

- Assessment summary engine complete (TASK-018)
- Estimate guardrails visible; approved estimate → project readiness explicit
- Invoice discounts, payment provider model, Square card payments (TASK-060, TASK-068, TASK-069)
- Referral ROI reporting (TASK-017)
- **Narrow production takeoff foundation (authorized 2026-08-10 CEO+eng review):** price_book code **1007** door-hardware deterministic material takeoff into `shopping_list_json` → job buy-list seed. See **TASK-103**. This is **not** full Production Intelligence (no Work Item Library platform, no licensed Craftsman import activation, no estimate-price engine flip).
- **Gate:** Phase 1 ops remains active in parallel. Owner may proceed with TASK-103 as Phase 3 estimate/materials work; broader PI (TASK-047/048, multi-family catalog, calc snapshots) stays Phase 4 until this slice proves out.

### Phase 4 — Production Intelligence (deferred)

- Work Item Library (TASK-047) and Confidence Engine (TASK-048) remain proposed
- Catalog-wide Production Profiles, Material Assemblies platform, calibration publish, licensed source catalog volume import
- No broader PI expansion until Phases 0–3 are boring **and** TASK-103 pilot evidence exists

## Phase → Epic Mapping

Backlog tasks must cite a phase. EPICs organize tasks; phases set priority.

```text
Phase 0 → EPIC-006 (role workspaces), TASK-059, day-close field work
Phase 1 → EPIC-001 (operations engine), EPIC-007 (field execution infrastructure)
Phase 1 exception → TASK-115 (promise capture; EPIC-005 delivery surface)
Phase 2 → EPIC-003 (property intelligence)
Phase 3 → EPIC-002 (estimating), EPIC-004 (billing)
Phase 4 → EPIC-008 (production intelligence stub)
EPIC-005 (platform/delivery) → cross-cutting; every task still cites a phase
```

## Out of Scope (until Phase 3 stable)

- Multi-company SaaS scaling
- Subscription/membership **expansion** (maintain existing; do not grow subsystem)
- Concierge/realtor routing layers
- New dashboard families
- AI-first product repositioning (AI assists estimates; does not define product)
- Greenfield rebuild / migration squash
- PR Gatekeeper MCP (TASK-036) until merged and proven in daily use

## Shipped and Canonical (not out of scope)

These are part of the product today:

- Operations Engine (`docs/canonical/OPERATIONS.md`)
- Location capture, day map, visit candidates (Phase 1 infrastructure)
- Work Order model (`docs/canonical/DOMAIN_MODEL.md`)
- Role-based workspaces / My Work field home (EPIC-006)

## Documentation Hierarchy

```text
Layer 1 — Identity:     PRODUCT_VISION, DOMAIN_MODEL
Layer 2 — Architecture: OPERATIONS, WORKFLOW, ARCHITECTURE, PRODUCTION_INTELLIGENCE
Layer 3 — Phasing:      ROADMAP (this file)
Layer 4 — Tasks:        docs/backlog/
Layer 5 — Doctrine:     docs/working/execution-doctrine.md
```

Layer 3 wins over Layer 4 on scope disputes. See `CLAUDE.md` for agent rules.