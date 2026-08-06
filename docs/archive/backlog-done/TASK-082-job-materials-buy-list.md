# TASK-082: Job-owned materials buy list (estimate seed)

Status:
Done

Phase:
3

Problem:
Shopping lists and materials planning are estimate-centric. Operators only get a
usable store list when materials were generated on the estimate path
(`/app/estimates/[id]/shopping-list`, `shopping_list_json`). Job surfaces mostly
deep-link to that estimate list. Job-level "materials" today are largely
post-purchase receipts (`JobMaterialsPanel`), not a pre-run buy list. Without a
rich estimate materials path, the operator wings it from memory + truck stock and
still makes second store trips for missing items.

Business Value:
One trusted **job buy list** before the work day so Dovetails can leave for the
store once per job, seed from estimate when present, and plan T&M / thin-estimate
jobs without hunting estimate URLs. Reduces second trips and forgotten consumables.

Scope (B1 — first ship; eng-locked 2026-08-04):
- Canonical route `/app/jobs/[id]/materials?tab=buy|purchases`.
- Normalized table `job_material_lines` (+ seed metadata on `jobs`), account RLS.
- Pure helpers in `apps/web/lib/jobs/buy-list.ts` (map seed, match key, merge-missing).
- CRUD API for lines; **seed via POST/server action only** (never side-effect on GET).
- Seed source: prefer estimate `shopping_list_json` when present; else recompute with
  the same domain path the estimate shopping-list page uses.
- UI: Buy list | Purchases (reuse receipts panel); status toggles
  `needed` | `purchased` | `on_truck` | `not_needed` (operator checkmarks, not inventory).
- Roles: owner/admin/office full CRUD; tech assigned → view + status toggle only.
- Rewrite materials deep links (What Next, dashboard, action-queue) to the job route.
- Unit tests for mappers, seed idempotency expectations, authz.

Out of Scope (separate tasks / later phases):
- Work-type kits apply (B2) — content-gated on operator 5-job second-trip log + ≥3 kits.
- Assessment materials-readiness platform (B3).
- AI "suggest missing items" (B4).
- Day-of multi-job materials rollup.
- Multi-provider AI chatbot.
- Auto-match receipt lines → buy list lines.
- Reusing or extending `work_order_materials` (priced WO lines; different purpose).
- Auto-seed on GET / server-component render.

Acceptance Criteria:
- [x] Any active job opens a buy list at `/app/jobs/{id}/materials` without requiring
      an estimate shopping-list URL.
- [x] Seed from linked estimate (approved preferred, else latest sent) populates lines
      in one explicit action; second seed does not duplicate without re-seed.
- [x] Re-seed default is add-missing only (match key: case-insensitive name + unit);
      does not auto-bump qty on matches.
- [x] Purchases tab still shows existing job-linked expenses/receipts.
- [x] Dashboard / What Next / action-queue materials actions deep-link to the job buy list.
- [x] Gate: unit tests for pure mappers + seed/reseed rules; typecheck/lint clean for touched packages.
- [x] Backlog/design: work cites design doc
      `~/.gstack/projects/byesaw13-ai-fsm/nick-main-design-job-materials-plan-20260804.md`
      and eng review locks therein.

Notes:
- Design: office-hours APPROVED 2026-08-04; eng review CLEAR for B1 (scope reduced:
  B1 only + table; kits deferred).
- ROADMAP Phase 3 (estimate → job handoff / production ops). Migration
  `166_job_material_lines.sql`. Shipped PR #572 (`15bedc5`).
- Follow-on (not this task): B2 kits after operator assignment (5 real jobs: morning
  buy + second-trip items → 3 kit drafts).
- Archived in backlog truth pass 2026-08-05.
