# North Star Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three competing direction sources with one phased `ROADMAP.md`, a five-layer documentation hierarchy, promoted execution doctrine, and a backlog hygiene pass — docs only, no application code.

**Architecture:** Rewrite `docs/canonical/ROADMAP.md` as the single north star. Promote `memory/design-stabilize-not-rebuild.md` to `docs/working/execution-doctrine.md`. Update `CLAUDE.md` and `docs/backlog/README.md` to enforce layer rules. Extract six shipped tasks from epic files into `docs/archive/backlog-done/`.

**Tech Stack:** Markdown only. Verification via `pnpm gate:fast` (unchanged) and grep/read checks.

**Spec:** `docs/superpowers/specs/2026-07-03-north-star-reconciliation-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `docs/canonical/ROADMAP.md` | Single north star: phases 0–4, execution principles, phase→epic map |
| `docs/working/execution-doctrine.md` | Engineering discipline: works first, scope freeze, clean on contact |
| `CLAUDE.md` | Five-layer hierarchy; Layer 5 reference |
| `docs/backlog/README.md` | Phase rules, updated task index |
| `docs/backlog/EPIC-*.md` | Remove archived tasks; add Completed links |
| `docs/archive/backlog-done/TASK-0*.md` | Six newly archived task files |
| `memory/design-stabilize-not-rebuild.md` | Pointer stub only |

**Branch:** Create `docs/north-star-reconciliation` from `main` (or current branch if merging with field-tools work — prefer a dedicated docs branch off `main`).

---

### Task 1: Rewrite ROADMAP.md

**Files:**
- Modify: `docs/canonical/ROADMAP.md` (full replace)

- [ ] **Step 1: Replace `docs/canonical/ROADMAP.md` with this content**

```markdown
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
```

- [ ] **Step 2: Verify no nested fence errors**

```bash
cd /home/nick/ai-fsm-deploy-clean && head -30 docs/canonical/ROADMAP.md
```

Expected: file renders with North Star, Execution Principles, Phases tables.

- [ ] **Step 3: Commit**

```bash
git add docs/canonical/ROADMAP.md
git commit -m "docs(canonical): rewrite ROADMAP as single north star with phases 0-4"
```

---

### Task 2: Create execution-doctrine.md

**Files:**
- Create: `docs/working/execution-doctrine.md`
- Modify: `memory/design-stabilize-not-rebuild.md`

- [ ] **Step 1: Create `docs/working/execution-doctrine.md`**

Copy content from `memory/design-stabilize-not-rebuild.md`, then apply these edits:

1. Change title to `# Execution Doctrine`
2. Change status line to `**Status:** Active`
3. Remove `Mode: Intrapreneurship` line
4. Add after status block:

```markdown
**Authority:** Layer 5 in the documentation hierarchy. Governs engineering discipline only — not product scope. Product phasing lives in `docs/canonical/ROADMAP.md`.
```

5. Update "Phase 0 — Works" section to reference ROADMAP Phase 0 (not a separate numbering)
6. Update "Rule 1: Scope freeze" to say "per `docs/canonical/ROADMAP.md` out-of-scope list"

- [ ] **Step 2: Replace `memory/design-stabilize-not-rebuild.md` with pointer**

```markdown
# Moved

This document is now canonical working doctrine:

**`docs/working/execution-doctrine.md`**

Do not use this file as an instruction source.
```

- [ ] **Step 3: Commit**

```bash
git add docs/working/execution-doctrine.md memory/design-stabilize-not-rebuild.md
git commit -m "docs: promote execution doctrine to docs/working/"
```

---

### Task 3: Update CLAUDE.md hierarchy

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the Documentation Hierarchy section (lines 9–29) with:**

```markdown
## Documentation Hierarchy

Five layers — lower layers never override higher layers on **scope**. Use in this order:

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

1. Code and database migrations are the implemented truth.
2. `docs/canonical/` is authoritative for product, domain, and architecture.
3. `docs/backlog/` is an execution queue — it must cite a ROADMAP phase; ROADMAP wins on scope disputes.
4. `docs/contracts/` and `docs/working/` contain supporting implementation notes.
5. `ai/` is only a compact AI-agent quick-reference layer.
6. `docs/archive/` and `docs/generated/` are historical/evidence only, not instruction sources.
7. `memory/` is session notes only — never an instruction source.

Canonical docs for product direction:

- `docs/canonical/PRODUCT_VISION.md`
- `docs/canonical/DOMAIN_MODEL.md`
- `docs/canonical/WORKFLOW.md`
- `docs/canonical/ARCHITECTURE.md`
- `docs/canonical/ROADMAP.md`
- `docs/canonical/PRODUCTION_INTELLIGENCE.md`
- `docs/canonical/OPERATIONS.md`

Working doctrine: `docs/working/execution-doctrine.md`
```

- [ ] **Step 2: Add to Documentation Rules (after rule 1):**

```markdown
2. Every backlog task must cite a `ROADMAP.md` phase. Tasks without a phase are invalid.
```

(Renumber subsequent rules.)

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document five-layer hierarchy and execution doctrine in CLAUDE.md"
```

---

### Task 4: Update backlog README rules and task index

**Files:**
- Modify: `docs/backlog/README.md`

- [ ] **Step 1: Add after "How this relates to the canonical docs" section:**

```markdown
### Phase mapping (required)

Every task must include a `Phase:` field matching `docs/canonical/ROADMAP.md`:

```text
Phase: 0 | 1 | 2 | 3 | 4 | cross-cutting
```

- Tasks **without** a ROADMAP phase are invalid. Add the phase to ROADMAP before creating the task.
- When backlog and ROADMAP disagree on scope, **ROADMAP wins**.
- Backlog is an execution queue, not product strategy.
```

- [ ] **Step 2: Update Task format section to include Phase:**

```markdown
Status:
Proposed | Ready | In Progress | Done | Deferred

Phase:
0 | 1 | 2 | 3 | 4 | cross-cutting
```

- [ ] **Step 3: Update task index table — close these as Done:**

| ID | New Status |
|----|------------|
| TASK-024 | Done |
| TASK-025 | Done |
| TASK-026 | Done |
| TASK-027 | Done |
| TASK-033 | Done |
| TASK-060 | Done |

- [ ] **Step 4: Update task index — defer these:**

| ID | New Status |
|----|------------|
| TASK-036 | Deferred |
| TASK-047 | Deferred |
| TASK-048 | Deferred |
| TASK-011 | Deferred |
| TASK-012 | Deferred |
| TASK-013 | Deferred |

- [ ] **Step 5: Verify In Progress count ≤ 12**

```bash
grep -c "In Progress" docs/backlog/README.md
```

Expected: ≤12 in the index table (not counting legend).

- [ ] **Step 6: Commit**

```bash
git add docs/backlog/README.md
git commit -m "docs(backlog): enforce ROADMAP phase mapping and hygiene index"
```

---

### Task 5: Archive six shipped tasks

**Files:**
- Create: `docs/archive/backlog-done/TASK-024-passive-location-capture.md`
- Create: `docs/archive/backlog-done/TASK-025-bluetooth-auto-mileage.md`
- Create: `docs/archive/backlog-done/TASK-026-day-map.md`
- Create: `docs/archive/backlog-done/TASK-027-hybrid-tracking.md`
- Create: `docs/archive/backlog-done/TASK-033-read-only-mcp.md`
- Create: `docs/archive/backlog-done/TASK-060-invoice-discounts.md`
- Modify: `docs/backlog/EPIC-004-billing-and-profitability.md`
- Modify: `docs/backlog/EPIC-005-platform-and-delivery.md`
- Modify: `docs/backlog/EPIC-007-location-intelligence.md`
- Modify: `docs/archive/backlog-done/README.md`

- [ ] **Step 1: For each task, copy full text from epic file into archive file**

Pattern (example TASK-033):

```markdown
# TASK-033: Read-Only Business MCP Server

Status:
Done

Phase:
cross-cutting

[... rest of task body from EPIC-005 ...]

Notes:
Archived during north-star reconciliation (2026-07-03). Shipped in services/mcp/.
```

Before archiving, verify shipped evidence and mark acceptance criteria `[x]` where met:

| Task | Verify command |
|------|----------------|
| TASK-033 | `ls services/mcp/src/tools/*.ts \| wc -l` → 8 |
| TASK-026 | `test -f apps/web/app/app/timeline/DayMap.tsx && echo OK` |
| TASK-060 | `ls db/migrations/132_invoice_line_item_discounts.sql && echo OK` |
| TASK-024 | `test -f db/migrations/114_location_capture.sql && test -f apps/web/app/api/internal/location/route.ts && echo OK` |
| TASK-025 | `grep -l bluetooth db/migrations/*.sql docs/working/*.md 2>/dev/null \| head -3` |
| TASK-027 | `grep -r "travel" apps/web/app/app/timeline/ --include="*.tsx" -l \| head -3` |

If a task's acceptance criteria are **not** fully met, do **not** archive as Done — leave In Progress and note gaps in the archive file header. TASK-024/025 epic files currently say "not started" — verify code before closing.

- [ ] **Step 2: Remove archived task bodies from epic files**

In each epic, replace the full task section with a one-line Completed link:

```markdown
## Completed

- [TASK-033: Read-Only Business MCP Server](../../archive/backlog-done/TASK-033-read-only-mcp.md)
```

- [ ] **Step 3: Update `docs/archive/backlog-done/README.md`**

Add the six new tasks to the index list.

- [ ] **Step 4: Commit**

```bash
git add docs/archive/backlog-done/ docs/backlog/EPIC-*.md
git commit -m "docs(backlog): archive six shipped tasks to backlog-done"
```

---

### Task 6: Add Phase field to remaining In Progress tasks

**Files:**
- Modify: epic files containing In Progress tasks

- [ ] **Step 1: Add `Phase:` to each remaining In Progress task per spec**

| Task | Phase |
|------|-------|
| TASK-017 | 3 |
| TASK-018 | 3 |
| TASK-020 | 0 |
| TASK-046 | 1 |
| TASK-053 | 1 |
| TASK-056 | 1 |
| TASK-058 | 0 |
| TASK-059 | 0 |
| TASK-068 | 3 |

Insert after `Status:` block in each task definition.

- [ ] **Step 2: Mark deferred tasks in epic files**

TASK-036 → `Deferred`, Phase: `cross-cutting`  
TASK-047, TASK-048 → `Deferred`, Phase: `4`  
TASK-011, TASK-012, TASK-013 → `Deferred`, Phase: `2`

- [ ] **Step 3: Commit**

```bash
git add docs/backlog/
git commit -m "docs(backlog): add Phase field to active and deferred tasks"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Hierarchy grep check**

```bash
cd /home/nick/ai-fsm-deploy-clean
grep -l "execution-doctrine" CLAUDE.md docs/canonical/ROADMAP.md
grep "Phase 0" docs/canonical/ROADMAP.md
grep "Phase mapping" docs/backlog/README.md
test ! -s memory/design-stabilize-not-rebuild.md || grep -q "Moved" memory/design-stabilize-not-rebuild.md
```

Expected: all greps match; memory file is pointer only.

- [ ] **Step 2: Count In Progress in backlog index**

```bash
awk '/^\| TASK-/ && /In Progress/' docs/backlog/README.md | wc -l
```

Expected: ≤12

- [ ] **Step 3: Run gate (docs-only — should be unchanged)**

```bash
pnpm gate:fast
```

Expected: `✓ gate:fast passed`

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git commit -m "docs: complete north star reconciliation" --allow-empty
# only if fixups were made; skip if nothing changed
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Rewrite ROADMAP | Task 1 |
| Create execution-doctrine.md | Task 2 |
| Update CLAUDE.md | Task 3 |
| Backlog README phase rules | Task 4 |
| Archive 6 tasks | Task 5 |
| Phase field on active tasks | Task 6 |
| memory/ pointer stub | Task 2 |
| ≤12 In Progress | Tasks 4, 5, 7 |
| Docs-only PR | All tasks |

## Follow-up (separate PRs — not this plan)

1. **Phase 0 execution:** Merge `feat/my-work-field-tools`; run field day smoke test
2. **Migration fix:** Rename duplicate `137_*` migration prefix
3. **Prod checklist:** Record PASS/FAIL on `docs/PROD_READINESS_CHECKLIST.md`