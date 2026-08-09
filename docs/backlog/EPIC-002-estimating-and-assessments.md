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
Scaffolded, not wired

Phase:
3

Problem:
Single-source estimating fails because generic AI lacks trade labor standards, supplier catalog pricing is disconnected from scope drafts, and national benchmark averages don't reflect Dovetails' actual past job performance.

Business Value:
Creates a unified 3-layer pricing model: Layer 1 (CSI/RSMeans labor-hour standards), Layer 2 (Home Depot / Lowe's / distributor material catalogs & fastener kits), Layer 3 (Dovetails local historical actuals & Bayesian calibration).

**Status note (CEO review, PR #589):** the domain module (`packages/domain/src/hybrid-pricing/`) is built, tested (7 unit tests), and exported — but verified via `grep` that nothing in `apps/web` or `services/` calls it. It delivers zero user-facing value today. Four known bugs must be fixed before this is safe to wire in (see Acceptance Criteria) — do not call this from the app until all are resolved.

**Status note (Eng review, PR #589, outside-voice pass):** the `layer1Unmatched` fix (commit 9b65b47) only annotates the summary text — it does not exclude `GENERIC_UNMATCHED_BENCHMARK`'s fabricated hours from `finalLineTotalCents`/`grandTotalCents`. See new blocking AC below.

Scope:
- Create domain module `packages/domain/src/hybrid-pricing/` implementing Layer 1 (RSMeans-style trade labor standards), Layer 2 (Distributor catalog mapping & hardware kits), and Layer 3 (Historical actuals calibration blending).
- Update price book entries and AI estimate generator to combine all three layers seamlessly.
- Expose 3-Layer pricing breakdown on the estimate creation/edit UI.

Out of Scope:
- Scraping restricted paid APIs without consent.

Acceptance Criteria:
- [x] `packages/domain/src/hybrid-pricing/` created with Layer 1, Layer 2, and Layer 3 engines.
- [ ] **Blocking:** fix `findLayer1Benchmark`'s same-trade wrong-match risk — `query.includes(b.tradeCategory)` matches the FIRST catalog entry for that trade on any query containing the trade name, even when it's the wrong item (verified: "electrical panel upgrade" silently matches the chandelier-hang benchmark, no `layer1Unmatched` flag, confident-looking wrong output). The zero-match case is already fixed (throws `UnmatchedBenchmarkError`); this is the milder same-trade sibling of that bug, still live.
- [ ] **Blocking:** Layer 2 (`getLayer2MaterialCost`) only meaningfully covers PVC trim and chandelier fixtures — plumbing, painting, and drywall (all present in Layer 1) fall through to a generic $3.50/unit + $15 placeholder with no warning surfaced to the user, unlike `layer1Unmatched`. When fixing, mirror the `UnmatchedBenchmarkError`/`layer1Unmatched` pattern already built for Layer 1 in `standards-catalog.ts`/`engine.ts` rather than re-deriving a new approach.
- [ ] **Blocking:** `computeHybridEstimateItem`'s `layer1Unmatched` flag is display-only — it doesn't gate the number. On an unmatched item it still runs `GENERIC_UNMATCHED_BENCHMARK` (flat `standardLaborHoursPerUnit: 1.0`, hardcoded `unit: "each"` regardless of the request's real unit) through the normal cost math and rolls the result into `finalLineTotalCents`/`grandTotalCents` — a fabricated number with a warning stapled on, not excluded from the total. Fix: exclude the unmatched line from the computed total (e.g. return $0/force manual entry) instead of estimating a fake one.
- [ ] **Blocking:** wire an actual call site in `apps/web` (currently none) before marking this "In Progress" again.
- [ ] Estimate engine computes combined quote with trade labor hours, live/catalog material prices, and local actuals adjustment factor.
- [ ] Unit tests verify 3-layer pricing calculations.

# TASK-099: Reconcile Materials Delta Capture (TASK-094) with Estimate Benchmark Calibration (TASK-098)

Status:
Proposed

Phase:
3

Problem:
TASK-094 (materials trust calibration) and TASK-098 (3-layer hybrid estimating
engine, Layer 3) are independently building toward the same goal — calibrating
future estimates against real outcomes — with no connection between them.
TASK-094 captures AI-proposed-vs-founder-edited deltas at estimate time;
TASK-098's benchmark script compares estimate-vs-actual at job completion.
Left unreconciled, this risks two parallel, drifting "trust the numbers"
mechanisms instead of one coherent calibration source of truth.

Business Value:
A single calibration system is more trustworthy and maintainable than two
independent ones computing related but different signals.

Scope:
- Once both have accumulated meaningful data, evaluate whether TASK-094's
  delta signal and TASK-098's benchmark output should feed one shared
  calibration model, or remain deliberately separate (pre-job judgment vs.
  post-job outcome are genuinely different signals — may be correct to keep
  distinct).

Out of Scope:
- Any implementation now — both sources are still evidence-gathering stage
  (TASK-094 has zero real data yet; TASK-098's benchmark run found N=1 clean
  sample). Premature to reconcile before either has enough data to reconcile.

Acceptance Criteria:
- [ ] Revisit once TASK-094 or TASK-098 has enough real data to make the
  reconciliation question concrete rather than speculative.

Notes:
Surfaced during CEO review of PR #589 (hybrid estimating engine).

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
how it's computed. Separately, the $85/hr burdened rate is hardcoded
independently in both `EstimateSummaryCard.tsx` and
`hybrid-pricing/engine.ts` with no shared constant — a landmine if the two
diverge later.

Business Value:
A T&M-vs-Fixed comparison that can actually inform the pricing decision,
instead of one that's rigged toward Fixed by construction.

Scope:
- Model T&M hours independently of the fixed quote's hour estimate — e.g. a
  founder-adjustable "expected overrun %" input, or (once TASK-095/098 have
  real data) a historical variance-based estimate.
- Extract the burdened labor rate into one shared constant both files import.

Out of Scope:
- Automated overrun prediction from historical data — depends on TASK-095
  accumulating enough real samples first.

Acceptance Criteria:
- [ ] T&M estimated hours can diverge from the fixed quote's hours in the UI.
- [ ] Burdened rate defined once, imported by both `EstimateSummaryCard.tsx`
  and `hybrid-pricing/engine.ts`.

Notes:
Surfaced during CEO review of PR #589. Priority P2 — the card's Fixed-price
math is currently correct, only the comparison framing is misleading.

## Completed

- [TASK-018: Assessment Summary Engine](../archive/backlog-done/TASK-018-assessment-summary-engine.md) — Done (Wave 3 2026-08-05)

- [TASK-006: Assessment → Materials Generator Context](../archive/backlog-done/TASK-006-assessment-to-materials-generator-context.md) — Done
- [TASK-007: Assessment → Estimate Context](../archive/backlog-done/TASK-007-assessment-to-estimate-context.md) — Done
- [TASK-082: Job-owned materials buy list (estimate seed)](../archive/backlog-done/TASK-082-job-materials-buy-list.md) — Done (PR #572)
