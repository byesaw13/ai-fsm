# EPIC-002: Estimating & Assessments

Turning a site assessment into an accurate, defensible estimate with minimal
re-keying, and keeping estimate structure consistent across jobs.

## Active tasks

# TASK-094: Materials Estimate Trust & Calibration (Approach D — delta capture)

Status:
In Progress

Phase:
3

Problem:
The AI materials generator (TASK-006/TASK-018) is used on every estimate, but
its quantities and prices aren't trusted, so the founder re-checks and
re-counts by hand — doing the estimating work twice. The tool exists; the
workaround exists around it, not instead of it.

Business Value:
Closes the loop from "AI proposed a quantity" to "did that quantity turn out
to be right," so trusted items eventually stop requiring a full recount. Also
fixes a live data-integrity bug: AI-guessed prices saved via the generator's
"save to price book" checkbox were folding into `avg_paid_cents`/
`purchase_count` as if a real purchase happened, contaminating the price
history TASK-086's receipt-learning pipeline is supposed to be authoritative
for.

Scope:
- Capture the AI-proposed vs. founder-edited quantity/price immutably at
  generation time and persist it on the estimate (`shopping_list_json.
  ai_materials_delta`), surfaced on the estimate detail page (owner/admin
  only).
- Stop AI-guessed prices from polluting `materials_price_book`'s rolling
  average / purchase count.

Out of Scope (deliberately deferred until this delta shows a real pattern
worth calibrating against — see design doc):
- Outcome-tap UI / job-close capture (whether a quantity was actually
  "enough") — depends on resolving which table (`job_material_lines` vs.
  `visit_parts`) is the right actual-usage anchor; not yet resolved.
- Auto-detection of under-ordering from repeat supply-house purchases.
- Feeding calibration data back into the generator's prompt by job type —
  blocked on job type not currently surviving onto created jobs
  (`create-job-db.ts` hardcodes `job_type: 'custom'`).
- Extending this pattern to labor-hour estimates.

Acceptance Criteria:
- [x] `ai_quantity`/`ai_unit_cost_cents` captured immutably per item at
  generation time, surviving founder edits and mid-session removals.
- [x] Delta persisted on the estimate via a collision-safe key (verified
  against the existing job-buy-list seed mapper, which must ignore it).
- [x] Delta surfaced on the estimate detail page for items that were edited.
- [x] AI-guessed price saves no longer update `avg_paid_cents`/
  `purchase_count`; real receipt-backed purchases are unaffected (regression
  tested).
- [ ] Merged to main.
- [ ] Real usage over a few weeks shows whether there's a genuine systematic
  **edit-rate** pattern (e.g. "decking quantity consistently gets increased by
  founders") worth building calibration against — the actual deliverable of
  this task, not a specific event firing.

Explicitly: this delta measures **pre-job founder judgment** (did the founder
change what the AI proposed before the job even started), not **completed-job
outcome accuracy** (did the approved quantity turn out to be enough on site).
An accepted-but-wrong AI quantity, or an incorrect founder edit, produces no
signal here — that requires a real usage/actuals source (`job_material_lines`
vs. `visit_parts`, unresolved — see Out of Scope) and is explicitly a later
step, not something this task's acceptance criteria claim to deliver.

Notes:
Went through `/office-hours` → `/plan-ceo-review` → `/plan-eng-review`, each
stage catching real errors in the one before it (an outside-voice review
rejected an earlier, larger staged design before it was descoped to this
minimal version; a second outside-voice pass then corrected the eng review's
own first storage decision). Design doc:
`~/.gstack/projects/byesaw13-ai-fsm/nick-main-design-20260807-200440-materials-estimate-trust-calibration.md`.
Implementation: PR #587 (delta capture) and PR #586 (price-book fix,
independent, can land separately). Loosely adjacent to the not-yet-committed
PI-007 (Historical Production Learning) and PI-010 (Estimate Explanation
Engine) strategic concepts in `docs/canonical/PRODUCTION_INTELLIGENCE.md`,
but scoped far smaller and not filed as PI work — this is a materials-only,
evidence-gathering first step, not a claim on that roadmap.

# TASK-008: Room-Based Estimate Templates

Status:
Proposed

Phase:
3

Problem:
Repeated estimate structures (e.g. per-room line sets) are rebuilt by hand each
time.

Business Value:
Faster, more consistent estimates for common job shapes.

Scope:
- Reusable room-level templates that seed estimate line items.

Out of Scope:
- AI-generated templates.

Acceptance Criteria:
- [ ] An estimator can apply a room template to seed line items.
- [ ] Templates are editable after applying.

Notes:
Adjacent groundwork exists in `db/migrations/095_estimate_room_specs.sql` (room
specs), but no template system is built yet.

# TASK-009: Estimate Versioning

Status:
Proposed

Phase:
3

Problem:
When an estimate changes after being sent, there is no clean record of what the
client previously saw.

Business Value:
Clear change history protects against disputes and supports re-quoting.

Scope:
- Track estimate versions and which version was sent/approved.

Out of Scope:
- Automatic change-order generation.

Acceptance Criteria:
- [ ] Editing a sent estimate creates a new version rather than overwriting.
- [ ] The approved version is identifiable.

Notes:
No implementation found in repo.

# TASK-096: Financial Truth Card, T&M vs Fixed Comparison & Actionable Advisory Guardrails

Status:
Done

Phase:
3

Problem:
Estimators feel blind because financial truth (burdened costs, profit $, gross margin %, effective hours) is hidden in the background. Additionally, pricing warnings lack actionable suggestions on how to reach minimums or improve profitability, and hard blocks restrict owner flexibility.

Business Value:
Surfaces live financial truth, side-by-side Fixed Rate vs T&M pricing mode comparison, and soft advisory warnings with one-tap suggestions for profitability improvements.

Scope:
- Render Internal Financial Truth Card on estimate detail/edit screens (Internal Cost, Profit $, Gross Margin %, Effective Hours).
- Render Side-by-Side Pricing Mode Comparison Card (Fixed Rate vs T&M).
- Replace hard blocks with non-blocking advisory warnings accompanied by actionable suggestions (e.g. add trip fee to meet $185 minimum, add material handling to fix margin, suggest bundle rate for over-estimated jobs).

Out of Scope:
- Blocking estimate delivery or forcing hard errors.

Acceptance Criteria:
- [x] Estimate detail screen displays Internal Financial Truth Card.
- [x] Estimate detail screen displays T&M vs. Fixed Rate Comparison Card.
- [x] Pricing warnings are non-blocking and include one-tap actionable suggestions to fix profitability or meet minimums.
- [x] Tests cover advisory suggestions generation.

# TASK-097: Trade Construction Knowledge Engine (Building Science & Concealed Condition Intelligence)

Status:
Done (with a known partial-wiring gap — see status note)

Phase:
3

Problem:
Generic AI estimators generate naive scope drafts that miss critical trade execution steps, concealed-condition risks (rot under trim, unbraced electrical boxes), building code requirements (NEC 314.27 chandelier limits), and hidden consumables (OSI Quad caulk, Cortex screws, Z-flashing).

Business Value:
Embeds deep building science and trade execution rules into the estimate engine so every draft automatically accounts for substrate inspection, prep, weatherproofing, hardware, high-access setup, and change-order disclaimers.

**Status note (Eng review, PR #589, outside-voice pass):** `detectTradeProfiles`/`getConcealedRiskDisclaimers` are genuinely wired into `task-decomposer.ts`. `getRequiredHardwareRules` (the third exported function, built with the same hardware cost/reasoning data) has zero callers anywhere in `apps/web`/`services/`. The 4th AC below ("materials generator includes hardware") is still true in effect, but only because `materials-generator.ts`'s prompt independently hardcodes the same OSI Quad Max / Cortex screw facts as inline text — a duplicate of `carpentry.ts`'s `requiredHardware` data, not a call to it. Same "shipped but unused" pattern as TASK-098, smaller scale.

Scope:
- Create domain module `packages/domain/src/construction-profiles/` defining trade execution steps, concealed risk rules, and required hardware/fasteners.
- Update AI scope decomposer and materials generator to inject trade construction profiles into AI prompts and tool calls.
- Append field risk disclaimers and change-order trigger alerts to generated proposals.

Out of Scope:
- Automated building permit filing.

Acceptance Criteria:
- [x] `packages/domain/src/construction-profiles/` contains trade profiles for Carpentry, Painting, Electrical, Plumbing, and Drywall.
- [x] AI scope generator includes sub-task checklists, substrate inspection steps, and concealed risk disclaimers.
- [x] AI materials generator automatically includes trade fasteners, sealants, and weatherproofing hardware (via hardcoded prompt text, not via `getRequiredHardwareRules` — see status note).
- [x] Unit tests verify construction profile generation and prompt injection.
- [ ] Wire `getRequiredHardwareRules` into an actual caller (materials generator or task decomposer), replacing the hardcoded duplicate prompt text — or remove the unused function if the hardcoded-prompt approach is preferred.

# TASK-098: 3-Layer Hybrid Estimating Engine (Standard Benchmarks + Distributor Catalogs + Local Actuals Calibration)

Status:
Cancelled (unused scaffold deleted, PR #603 / TASK-108)

Phase:
3

Problem:
Single-source estimating fails because generic AI lacks trade labor standards, supplier catalog pricing is disconnected from scope drafts, and national benchmark averages don't reflect Dovetails' actual past job performance.

Business Value:
Would have created a 3-layer pricing model: Layer 1 (CSI/RSMeans labor-hour standards), Layer 2 (distributor catalogs), Layer 3 (local actuals calibration). Never wired; zero callers.

**Status note (PR #603):** `packages/domain/src/hybrid-pricing/` is gone. It was quarantined, unexported, and unused. Restore from git history before `fdc055c` only if this work is explicitly reopened as a new task. Do not treat the acceptance criteria below as describing the current tree.

Scope (historical):
- Domain module `packages/domain/src/hybrid-pricing/` with Layer 1 / 2 / 3 engines.
- Wire into price book + AI estimate generator + estimate UI.

Out of Scope:
- Scraping restricted paid APIs without consent.

Acceptance Criteria:
- [x] Unused scaffold deleted (TASK-108). Rebuild from git if ever resumed.

# TASK-108: Ponytail first cut — delete unused hybrid-pricing, vocabulary, log stubs

Status:
Done (PR #603)

Phase:
cross-cutting

Problem:
Quarantined `hybrid-pricing`, unused `vocabulary.ts`, unused
`operational-visibility.ts`, and unused `@ai-fsm/log` web/worker/mcp stubs
had zero callers. TASK-098 still claimed the scaffold existed.

Business Value:
Less unused code. Backlog matches the tree.

Scope:
- Delete the unused modules.
- Move `ACTIVE_JOB_STATUSES` onto `statuses.ts`.
- Retarget `@ai-fsm/log/web` callers to `@/lib/logger`.
- Mark TASK-098 Cancelled. Update DOMAIN_GUARDRAILS so it no longer points at
  `vocabulary.ts`.

Out of Scope:
- Later ponytail cuts beyond TASK-109.
- UI behavior changes.

Acceptance Criteria:
- [x] Deleted modules have no remaining imports.
- [x] TASK-098 status is Cancelled; resume only from git history.
- [x] DOMAIN_GUARDRAILS no longer imports a deleted adapter.

# TASK-099: Reconcile Materials Delta Capture (TASK-094) with Estimate Benchmark Calibration (TASK-098)

Status:
Deferred (TASK-098 cancelled)

Phase:
3

Problem:
TASK-094 (materials trust calibration) and TASK-098 (3-layer hybrid estimating)
were independently building toward the same goal. TASK-098's unused scaffold
was deleted in PR #603. Nothing to reconcile until a hybrid engine is rebuilt.

Business Value:
A single calibration system is more trustworthy than two drifting ones.

Scope:
- Revisit only if TASK-098 is reopened as a new task and both sources have data.

Out of Scope:
- Any implementation now.

Acceptance Criteria:
- [ ] Revisit only after a hybrid-estimating rebuild exists and TASK-094 has data.

Notes:
Surfaced during CEO review of PR #589. TASK-098 cancelled in PR #603.

# TASK-100: Fix T&M vs Fixed-Rate Comparison Card (Hours-Overrun Modeling)

Status:
Proposed

Phase:
3

Problem:
`EstimateSummaryCard.tsx`'s T&M vs. Fixed-Rate comparison (TASK-096) derives
T&M estimated hours from the same `effectiveHours` value used for the fixed
quote, so the comparison structurally can never model an hours-overrun
scenario — the actual reason T&M exists as a pricing option. The
"Recommendation: Fixed yields $X more" line is close to tautological given
how it's computed. The $85/hr burdened rate is hardcoded in
`EstimateSummaryCard.tsx` (`hybrid-pricing/engine.ts` was deleted in PR #603).

Business Value:
A T&M-vs-Fixed comparison that can actually inform the pricing decision,
instead of one that's rigged toward Fixed by construction.

Scope:
- Model T&M hours independently of the fixed quote's hour estimate — e.g. a
  founder-adjustable "expected overrun %" input, or (once TASK-095/098 have
  real data) a historical variance-based estimate.
- Extract the burdened labor rate into one shared constant.

Out of Scope:
- Automated overrun prediction from historical data — depends on TASK-095
  accumulating enough real samples first.

Acceptance Criteria:
- [ ] T&M estimated hours can diverge from the fixed quote's hours in the UI.
- [ ] Burdened rate defined once and imported by `EstimateSummaryCard.tsx`.

Notes:
Surfaced during CEO review of PR #589. Priority P2 — the card's Fixed-price
math is currently correct, only the comparison framing is misleading.

# TASK-101: Standalone & Direct Job/Visit Quick Materials Generator (Uncouple Materials from Estimates)

Status:
Done (implementation; live AI path requires ANTHROPIC_API_KEY set)

Phase:
3

Problem:
Generating a materials/buy list currently requires navigating into a formal client Estimate (`/app/estimates/[id]`). In field reality, technicians and founders frequently need a fast purchase-ready materials list directly from a Site Assessment (`/app/visits/[id]/assessment`), a Job (`/app/jobs/[id]/materials`), or a Standalone Quick Tool (`/app/materials/quick`) without being forced to create an Estimate first.

Business Value:
Uncouples materials generation from client estimates, saving time on site and enabling instant supply-house buy lists from any job, assessment, or voice/text scope description.

Scope:
- Create standalone Quick Materials List tool at `/app/materials/quick` (accessible from Quick Actions / Navigation).
- Add direct "🤖 Generate AI Materials List" button on the Job Materials page (`/app/jobs/[id]/materials`) that populates `job_material_lines` idempotently.
- Provide a one-tap "Copy Supply House Text" order on the standalone tool.

Out of Scope:
- Direct API automated purchase ordering with distributors.

Deferred to follow-up (TASK-102):
- Pass site-assessment context (visit ID + canonical assessment summary) into the quick generator instead of the current context-free link.
- "Save to Job Buy List" from the standalone tool (job selector + persist to `job_material_lines`).

Acceptance Criteria:
- [x] Standalone page `/app/materials/quick` allows entering scope text and generating a materials list immediately.
- [x] Job Materials page (`/app/jobs/[id]/materials`) has a one-tap "Generate AI Materials List" button that populates `job_material_lines`.
- [x] Generated materials list features a one-tap "Copy Order Text" button.

# TASK-102: Quick Materials — assessment context + save-to-job (follow-up to TASK-101)

Status:
Proposed

Phase:
3

Problem:
The standalone Quick Materials generator (TASK-101) takes free-typed scope only. Launching it from a populated site assessment discards the visit ID and assessment summary, and standalone results cannot be persisted to a job's buy list.

Scope:
- Carry visit context (visit ID) from the assessment page into `/app/materials/quick` and use the canonical assessment summary (`buildAssessmentSummary`) as generator input.
- Add a "Save to Job Buy List" action on the standalone tool: job selector + persist generated items to `job_material_lines` (reuse the idempotent `ai_generate` path).

Out of Scope:
- Automated distributor ordering.

Acceptance Criteria:
- [ ] Quick Buy List launched from an assessment pre-fills from that assessment's summary.
- [ ] Standalone results can be saved to a chosen job's buy list.

# TASK-103: Door Hardware (1007) Deterministic Materials Takeoff → Buy List

Status:
Ready

Phase:
3

Problem:
Door-related estimates either invent materials via AI prompts or, when the job
buy list falls back to category recompute, pull every `general_repairs`
service_materials row (drywall compound, mesh tape, etc.) that has nothing to
do with door hardware. Founders re-key hardware kits; techs hit store runs for
screws/strike plates that should have been on the list.

Business Value:
Proves the Production Intelligence *principle* (work first, deterministic
materials, no fabricated authority) on one real price_book code without
building the full Work Item / licensed-catalog platform. Seeds job buy lists
from a trustworthy takeoff for **1007 Door hardware replacement**.

Scope:
- Pure domain function `computeDoorHardwareTakeoff` for price_book code 1007
  with inputs: `hardwareType`, `unitCount`, `customerSupplied`.
- Emit `shopping_list_json.sections` using `specified_items` (null catalog ids —
  avoid UUID cast trap in buy-list hydration).
- Line `source` = **kit** (existing CHECK value; no new enum).
- Server-side merge helper on estimate shopping-list build (create path via
  `buildManualShoppingList` + shopping-list API when estimate includes 1007).
- **Critical:** do not include category-wide `general_repairs` materials (mud/tape)
  for 1007 lines — takeoff kit only.
- Unit + integration tests.
- Quarantine TASK-098 hybrid-pricing public export from domain index (do not wire). Deleted entirely in PR #603.

Out of Scope:
- work_items tables / Production Profiles platform
- Craftsman import or raw licensed rows
- Estimate price arithmetic cutover
- Families beyond 1007
- Auto-calibration / readiness full state machine
- Quick-estimate price_book_id identity fix (follow-up; document gap)

Acceptance Criteria:
- [x] Pure takeoff unit tests cover qty, package/waste, zero count, customer-supplied.
- [x] Incomplete inputs return empty items (no silent invent).
- [x] Domain barrel does not re-export hybrid-pricing.
- [x] `buildManualShoppingList` merges 1007 kit and **excludes** general_repairs scope materials for 1007.
- [x] Shopping-list API merges 1007 takeoff when lines reference 1007.
- [x] `mapShoppingListJsonToLines` maps service_code 1007 → source kit.
- [ ] Job buy-list seed integration: no drywall mud/tape for 1007-only estimates.
- [ ] End-to-end owner flow on live/prod after deploy.

Notes:
CEO+eng review 2026-08-10. Renumbered from accidental TASK-101 (that ID already
shipped as Quick Materials on main #591). Temporary identity = price_book 1007.

## Completed

- [TASK-018: Assessment Summary Engine](../archive/backlog-done/TASK-018-assessment-summary-engine.md) — Done (Wave 3 2026-08-05)

- [TASK-006: Assessment → Materials Generator Context](../archive/backlog-done/TASK-006-assessment-to-materials-generator-context.md) — Done
- [TASK-007: Assessment → Estimate Context](../archive/backlog-done/TASK-007-assessment-to-estimate-context.md) — Done
- [TASK-082: Job-owned materials buy list (estimate seed)](../archive/backlog-done/TASK-082-job-materials-buy-list.md) — Done (PR #572)
