# North Star Reconciliation — Design Spec

**Date:** 2026-07-03  
**Status:** Approved (2026-07-03)  
**Context:** Three competing direction sources (stale ROADMAP, backlog-as-strategy, stabilize doc outside hierarchy) caused agent and human confusion. Reconcile into one phased north star with a strict documentation hierarchy.

---

## Problem

Dovetails FSM has one product but three instruction sources that disagree:

| Source | Role it was playing | Actual problem |
|--------|---------------------|----------------|
| `docs/canonical/ROADMAP.md` | Product phasing north star | Stale — predates Operations Engine, work orders, location infrastructure |
| `docs/backlog/` | Implementation tracker | Treated as strategy; 21 stale In Progress tasks |
| `memory/design-stabilize-not-rebuild.md` | Execution doctrine | Correct for current week, but outside canonical hierarchy |

Meanwhile, `docs/canonical/OPERATIONS.md`, `WORKFLOW.md`, and `DOMAIN_MODEL.md` already describe the real product. Agents read `ROADMAP.md` first (per `CLAUDE.md`), see outdated phases and out-of-scope rules, then encounter commits on My Work and location capture. Direction feels scrambled even though the team is building coherently.

---

## Goals

1. **Single north star** — one `ROADMAP.md` that matches shipped code and canonical architecture docs.
2. **Strict hierarchy** — each doc layer answers one question; no layer competes with another.
3. **Backlog subordination** — tasks cite ROADMAP phases; backlog is execution queue, not strategy.
4. **Doctrine has a home** — stabilize principles promoted to `docs/working/execution-doctrine.md`.
5. **Backlog hygiene** — close shipped work; reduce In Progress from 21 to ≤12.

## Non-goals

- Code changes in the reconciliation PR (docs only)
- Migration squash or `packages/db` extraction
- Rewriting `OPERATIONS.md`, `WORKFLOW.md`, or `DOMAIN_MODEL.md` (already accurate)
- Changing product scope — only documenting what is already built and what is next

---

## Documentation Hierarchy

Five layers with strict roles. Lower layers never override higher layers on scope.

```text
Layer 1 — IDENTITY (what is this product?)
  docs/canonical/PRODUCT_VISION.md
  docs/canonical/DOMAIN_MODEL.md

Layer 2 — ARCHITECTURE (how does it work?)
  docs/canonical/OPERATIONS.md
  docs/canonical/WORKFLOW.md
  docs/canonical/ARCHITECTURE.md
  docs/canonical/PRODUCTION_INTELLIGENCE.md

Layer 3 — PHASING (what order do we build?)
  docs/canonical/ROADMAP.md

Layer 4 — TASKS (what's the next unit of work?)
  docs/backlog/

Layer 5 — DOCTRINE (how do we build without making debt worse?)
  docs/working/execution-doctrine.md
```

### Hierarchy rules

1. **Layer 3 wins over Layer 4** on scope disputes. When backlog and ROADMAP disagree, ROADMAP wins.
2. **Every backlog task must cite a ROADMAP phase** (e.g., `Phase: 0`). Tasks without a phase are invalid.
3. **`memory/` and `docs/generated/` are never instruction sources.** Evidence and session notes only.
4. **New scope requires a ROADMAP phase update** in the same PR that adds the backlog task.
5. **Layer 5 governs HOW, not WHAT.** Execution doctrine does not define product scope.

### Agent conflict resolution

When guidance conflicts:

1. Read `ROADMAP.md` — is the work in an active phase?
2. If the task has no phase → stop; ask user to add to ROADMAP first.
3. If ROADMAP says out-of-scope → stop unless user explicitly overrides.
4. `execution-doctrine.md` governs engineering discipline (clean on contact, no rebuild).
5. `OPERATIONS.md` governs architecture questions, not phasing.

---

## Rewritten ROADMAP Structure

Replace the current 4-phase `ROADMAP.md` with this content.

### North Star

```text
Client → Property → Estimate → Project → Work Order → Visit → Invoice → History
```

Aligns with `DOMAIN_MODEL.md` and `WORKFLOW.md`. Backend `jobs` present as **Project** in UI.

### Execution Principles

| Principle | Rule |
|-----------|------|
| Works before clean | Ship fixes before structural refactors |
| Scope freeze | No new EPICs, tables, or routes until Phase 0 and Phase 1 are boringly reliable |
| Clean on contact | Pay debt only in files already being edited for a feature or fix |
| No rebuild | This repo is the only product; migration squash and greenfield cutover are deferred |
| References over ownership | One source of truth per fact; aggregates hold references, not copies |

### Phases

| Phase | Name | Status | Scope |
|-------|------|--------|-------|
| **0** | Field Ops Reliability | **Active** | Technician day flow boring: start day → clock → work orders → day close. Merge `feat/my-work-field-tools` and related day-close branches. |
| **1** | Operations Engine Completion | In progress | Finish Business Day, activity, vehicle, day close, current ops state per `OPERATIONS.md`. Location capture, day map, and hybrid tracking are **Phase 1 infrastructure**, not a separate product bet. |
| **2** | Property-Centered Surfaces | Next | Property history findable from client, job, visit, estimate, and invoice surfaces. Visit evidence promoted to permanent property record. |
| **3** | Estimate & Billing Closure | Planned | Assessment summary complete, estimate→job handoff explicit, invoice/payment connected to completed work. |
| **4** | Production Intelligence | Deferred | Only after Phases 0–3 are stable. TASK-047 and TASK-048 remain proposed. |

### Out of Scope (until Phase 3 stable)

- Multi-company SaaS scaling
- Subscription/membership **expansion** (maintain existing features; do not grow subsystem)
- Concierge/realtor routing layers
- New dashboard families
- AI-first product repositioning (AI assists estimates; does not define product identity)
- Greenfield rebuild / migration squash
- MCP write tools (TASK-035)
- PR Gatekeeper MCP (TASK-036) until merged and proven in daily use

### Removed from Out-of-Scope (shipped, canonical)

These were incorrectly listed as out of scope in the old ROADMAP:

- Operations Engine (`OPERATIONS.md`)
- Location capture / day map / visit candidates (Phase 1 infrastructure)
- Work Order model (canonical in `DOMAIN_MODEL.md`)
- Role-based workspaces / My Work field home (EPIC-006)

### Phase → Epic Mapping

```text
Phase 0 → EPIC-006 (role workspaces), TASK-059, day-close field branches
Phase 1 → EPIC-001 (operations engine), EPIC-007 (field execution infrastructure)
Phase 2 → EPIC-003 (property intelligence)
Phase 3 → EPIC-002 (estimating), EPIC-004 (billing)
Phase 4 → EPIC-008 (production intelligence stub)
EPIC-005 (platform/delivery) → cross-cutting; every task must still cite a phase
```

---

## Backlog Subordination

### Task format update

Add required `Phase:` field to every task:

```markdown
# TASK-XXX: Title

Status: ...
Phase: 0 | 1 | 2 | 3 | 4 | cross-cutting

Problem:
...
```

### README rules (`docs/backlog/README.md`)

Add:

- Tasks without a `ROADMAP.md` phase reference are invalid. Add the phase to ROADMAP first.
- Backlog is an execution queue, not product strategy. Canonical ROADMAP wins on direction.
- When a task ships, move to `docs/archive/backlog-done/` in the same PR.

### Hygiene pass — close as Done

| Task | Evidence |
|------|----------|
| TASK-024 | `114_location_capture.sql`, `internal/location/route.ts`, segments UI |
| TASK-025 | `116_location_event_vehicle_kinds.sql`, drive mileage slices |
| TASK-026 | `DayMap.tsx`, geometry routes |
| TASK-027 | Auto drive → travel time linkage |
| TASK-033 | `services/mcp/` — 8 read-only tools, tests |
| TASK-060 | `132_invoice_line_item_discounts.sql`, line-item routes |

Move each to `docs/archive/backlog-done/` and update epic completed sections.

### Hygiene pass — defer

| Task | Phase | Reason |
|------|-------|--------|
| TASK-036 | cross-cutting | PR Gatekeeper MCP — unmerged branch only |
| TASK-047, TASK-048 | 4 | Production Intelligence stub |
| TASK-011, TASK-012, TASK-013 | 2 | Property opportunities/health — Phase 2 |

### Remaining In Progress (≤12)

| Task | Phase | Notes |
|------|-------|-------|
| TASK-017 | 3 | Referral ROI — route stub, rollup incomplete |
| TASK-018 | 3 | Assessment summary — ~75% shipped |
| TASK-020 | 0 | PWA — blocked on HTTPS origin |
| TASK-046 | 1 | Privacy controls — partial |
| TASK-053 | 1 | Activity + assignment — partial |
| TASK-056 | 1 | Current ops state — ~60% |
| TASK-058 | 0 | Workspace auto-route — partial |
| TASK-059 | 0 | My Day consolidation — active branch |
| TASK-068 | 3 | Payment provider model — ~70% |

---

## File Changes

| Action | File | Notes |
|--------|------|-------|
| Rewrite | `docs/canonical/ROADMAP.md` | Full replacement per sections above |
| Create | `docs/working/execution-doctrine.md` | Promoted from `memory/design-stabilize-not-rebuild.md`; status Active |
| Update | `docs/backlog/README.md` | Phase rules, task index hygiene |
| Update | `CLAUDE.md` | Document 5-layer hierarchy and Layer 5 reference |
| Replace | `memory/design-stabilize-not-rebuild.md` | Short pointer to `docs/working/execution-doctrine.md` |
| Move | 6 task files | To `docs/archive/backlog-done/` |
| Update | Epic files | Completed sections for closed tasks |
| Update | `docs/backlog/README.md` task index | Reflect closures and phase column |

**This PR is docs-only.** No application code changes.

### Follow-up (separate PR, not this reconciliation)

- Fix duplicate migration prefix `137_*` (`137_accounts_day_review_settings.sql` and `137_project_work_order_visit_schema.sql`)
- Merge `feat/my-work-field-tools` (Phase 0 execution)

---

## Success Criteria

- [ ] `ROADMAP.md` matches `OPERATIONS.md`, `WORKFLOW.md`, `DOMAIN_MODEL.md`, and shipped code
- [ ] `docs/working/execution-doctrine.md` exists with Active status
- [ ] `docs/backlog/README.md` enforces phase mapping
- [ ] ≤12 tasks marked In Progress (down from 21)
- [ ] `CLAUDE.md` documents the 5-layer hierarchy
- [ ] `memory/design-stabilize-not-rebuild.md` points to doctrine doc; no standalone instructions remain in `memory/`
- [ ] Six shipped tasks archived to `docs/archive/backlog-done/`

---

## Dependencies

| Blocker | Status |
|---------|--------|
| User approval of this design | Approved 2026-07-03 |
| `feat/my-work-field-tools` merge | Phase 0 execution; not blocking doc PR |
| Canonical docs (`OPERATIONS.md`, etc.) | Already accurate; no rewrite needed |

---

## What This Does Not Change

- Product identity (`PRODUCT_VISION.md`)
- Domain model or workflow definitions
- Quality gates (`pnpm gate`, `pnpm gate:fast`)
- Production deployment target (`garonhome.local`)
- Existing shipped features (location, operations engine, work orders)

This reconciliation fixes **where instructions live and how they relate**, not what the product is.