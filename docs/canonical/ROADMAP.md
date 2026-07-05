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
| **0** | Field Ops Reliability | **Active** | Technician day flow boring: start day → clock → work orders → day close |
| **1** | Operations Engine Completion | In progress | Business Day, activity, vehicle, day close, current ops state per `docs/canonical/OPERATIONS.md`. Location capture, day map, and hybrid tracking are Phase 1 **infrastructure**. |
| **2** | Property-Centered Surfaces | Next | Property history findable from every workflow page; visit evidence promoted to permanent record |
| **3** | Estimate & Billing Closure | Planned | Assessment summary complete; estimate→job handoff explicit; invoice/payment connected to completed work |
| **4** | Production Intelligence | Deferred | Only after Phases 0–3 stable. See `docs/canonical/PRODUCTION_INTELLIGENCE.md` |

### Phase 0 — Field Ops Reliability (active)

- Merge My Work field tools (`FieldRightNowCard`, odometer checkpoints, decluttered layout)
- Day close checklist actionable on My Work
- PWA installability when HTTPS origin is available (TASK-020)
- Workspace routing: owner reaches My Work without broken mobile links

**Done when:** A full field day completes without workaround — start day, clock, work order, visit action, day review.

### Phase 1 — Operations Engine Completion

Canonical architecture: `docs/canonical/OPERATIONS.md`.

- Finish current ops state, activity + assignment model, day close + reopen
- Location capture, visit candidates, day map, hybrid tracking (shipped infrastructure — maintain, don't expand scope)
- Privacy controls for location data (TASK-046)

**Done when:** Payroll, activity, vehicle, and location concerns are independently lifecyclable; day close does not overload unrelated concerns.

### Phase 2 — Property-Centered Surfaces

- Property timeline reachable from client, job, visit, estimate, invoice surfaces
- Visit evidence (photos, notes, completion) promoted to permanent property record
- Property opportunities and health records (TASK-011–013) only after Phase 0–1 stable

### Phase 3 — Estimate & Billing Closure

- Assessment summary engine complete (TASK-018)
- Estimate guardrails visible; approved estimate → project readiness explicit
- Invoice discounts, payment provider model, Square card payments (TASK-060, TASK-068, TASK-069)
- Referral ROI reporting (TASK-017)

### Phase 4 — Production Intelligence (deferred)

- Work Item Library (TASK-047) and Confidence Engine (TASK-048) remain proposed
- No PI expansion until Phases 0–3 are boring

## Phase → Epic Mapping

Backlog tasks must cite a phase. EPICs organize tasks; phases set priority.

```text
Phase 0 → EPIC-006 (role workspaces), TASK-059, day-close field work
Phase 1 → EPIC-001 (operations engine), EPIC-007 (field execution infrastructure)
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
- MCP write tools (TASK-035)
- PR Gatekeeper MCP (TASK-036) until merged and proven in daily use

## Shipped and Canonical (not out of scope)

These are part of the product today:

- Operations Engine (`docs/canonical/OPERATIONS.md`)
- Location capture, day map, visit candidates (Phase 1 infrastructure)
- Work Order model (`docs/canonical/DOMAIN_MODEL.md`)
- Role-based workspaces / My Work field home (EPIC-006)
- Read-only Business MCP (TASK-033)

## Documentation Hierarchy

```text
Layer 1 — Identity:     PRODUCT_VISION, DOMAIN_MODEL
Layer 2 — Architecture: OPERATIONS, WORKFLOW, ARCHITECTURE, PRODUCTION_INTELLIGENCE
Layer 3 — Phasing:      ROADMAP (this file)
Layer 4 — Tasks:        docs/backlog/
Layer 5 — Doctrine:     docs/working/execution-doctrine.md
```

Layer 3 wins over Layer 4 on scope disputes. See `CLAUDE.md` for agent rules.