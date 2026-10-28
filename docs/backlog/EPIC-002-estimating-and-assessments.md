# EPIC-002: Estimating & Assessments

Turning a site assessment into an accurate, defensible estimate with minimal
re-keying, and keeping estimate structure consistent across jobs.

## Active tasks

- [TASK-217: Trade-aware estimating methods in Prepare Quote](TASK-217-trade-aware-estimate-methods.md) — focused correction, owner-approved 2026-10-27.

## Estimating assistant, Phase 3 slice (TASK-209 to TASK-216)

Approved by the owner 2026-10-26. Design: `docs/working/estimating-assistant-phase3.md`.
Foundation plus paint pilot first; the four other formula families follow only
after the pilot passes. Starts after PR #720 merges.

- [TASK-209: Estimating assistant, Phase 3 slice (parent)](TASK-209-estimating-assistant-phase3.md) — children TASK-210 to TASK-216.

## Craftsman reference hours (TASK-218)

Approved by the owner 2026-10-27 (TASK-218 table-freeze exception included). Source sheet:
`docs/working/craftsman-reference-pricebook.md`.

- [TASK-218: Craftsman reference hours and parts beside the price book](TASK-218-craftsman-reference-hours.md) — reference only; never feeds price or hours.
- [TASK-219: Owner review of production rates against Craftsman](TASK-219-production-rate-review.md) — owner decides each of the 21 rates; one guarded data migration.

## Hourly baseline and estimate audit (TASK-188 to TASK-206)

Owner decisions 2026-10-26: every estimate is compared with the company's
hourly rate as a reference only (the owner's price is never changed); hours
are person-hours with a recorded source; incomplete is a draft state, never a
way past the send rules. Audit findings from the same day are filed as
separate tasks by severity.

- [TASK-188: Hourly baseline on every estimate (parent)](TASK-188-hourly-baseline-every-estimate.md) — children TASK-189 to TASK-195, in order.
- [TASK-197: AI line suggestions never set a price](TASK-197-item-suggester-price-cap.md) — High.
- [TASK-199: Painting edit prices lines with the account's rates](TASK-199-painting-edit-account-rates.md) — Medium, latent.
- [TASK-200: Multi-option estimates keep correct totals and line types](TASK-200-multi-option-create-edit.md) — Medium, latent.
- [TASK-201: Room-by-room engine path is atomic and keeps adjustments](TASK-201-engine-path-atomic.md) — Medium, latent.
- [TASK-202: Prepared quote edge cases](TASK-202-prepared-quote-edge-cases.md) — Medium.
- [TASK-203: Portal approval matches the email and owner approval paths](TASK-203-portal-approval-parity.md) — Medium.
- [TASK-204: Harden the estimating AI calls](TASK-204-ai-call-hardening.md) — Medium.
- [TASK-205: Materials generator finishes within the tunnel limit](TASK-205-materials-generator-timeout.md) — Medium.
- [TASK-206: Estimate API cleanup and stale sent estimates](TASK-206-estimate-api-cleanup.md) — Low.

## Assessment-to-quote assistant (TASK-178 to TASK-182)

The owner walks the house room by room, measures, speaks or types what the
customer wants and what is wrong, and takes photos. Prepare Quote turns that
saved assessment into an editable draft with every requested task, labor
hours and materials per group, and only the questions that change price or
scope. After the customer approves the chosen option, the right deposit is
requested and scheduling starts.

Build order: TASK-178 (done) → TASK-179 (done) → TASK-180 (done) is the quote track. TASK-181 (guard done) →
TASK-182 (done) is the approval track. The two tracks do not depend on each other.
Documentation approved 2026-10-23. Implementation is not yet authorized.

Reference scenario (acceptance fixture for TASK-178 to TASK-180):

| Area | Observed facts and requested work | Unknowns that stay visible |
| --- | --- | --- |
| Room 1 | 10 × 10 ft; one entry door, two standard windows; picture-hanger pinholes; replace a missing 2 ft baseboard piece; paint ceiling; replace three missing faceplates. | Height, pinhole extent, baseboard profile, faceplate types. Whole-room wall painting was not requested. |
| Room 2 | About a 6 in hole near the lower-left corner of one wall; patch, prep, attempt paint match; no matching paint on site. | Color and sheen; wall area only if a whole-wall repaint is chosen. |
| Room 3 | Replace two recessed can lights with LED retrofits; replace one ceiling fan. | Retrofit compatibility, fan model, mounting/support condition. |
| Bathroom | 12 × 8 ft; one standard door, one 20 in closet door, one window; replace toilet, vanity, sink, faucet; replace rough vinyl floor; reseal shower; paint walls and ceiling; replace baseboards; prep and paint all trim. | Wall height, product models, subfloor condition. |

Owner answers already given: Dovetails supplies the toilet, vanity, faucet
and fan; show both floor options (sheet vinyl active, vinyl tile/plank kept as
an unpriced alternative, never charged twice); bathroom ceiling included;
possible concealed subfloor damage.

Known quantities: Room 1 ceiling 100 sq ft gross; bathroom floor 96 sq ft and
ceiling 96 sq ft gross; bathroom perimeter 40 LF gross; 2 LF baseboard; 3
faceplates; 2 LED retrofits; 1 fan. Bathroom walls stay unquantified until a
height or wall area is given. Missing dimensions never block tasks that do not
need them.

Numeric fixture (owner-supplied demonstration figures, not a price book):

| Group | Hours low–high | Materials |
| --- | ---: | ---: |
| Room 1 repairs, ceiling, baseboard, plates | 5–8 | $85 |
| Room 2 drywall patch and paint blending | 3–5 | $40 |
| Room 3 LED retrofits and fan | 3–5 | $190 |
| Bathroom fixtures, paint, trim, reseal | 15–23 | $750 |
| Bathroom sheet vinyl floor | 6–10 | $240 |
| Total | 32–51 | $1,305 |

With a test-only $85/hour rate and no handling, tax or travel: $4,025–$5,640.
This proves the arithmetic only. It does not set the account's billing rate.

Out of scope for this group: LiDAR/RoomPlan, local market price comparison,
labor-versus-elapsed schedule modeling, automatic learning from actuals, a
separate signed work agreement, and AI revise-from-feedback beyond
regenerating the draft. Researched starting assumptions for hours are in
scope: the owner should not have to invent every number.

# TASK-183: Chosen option flows into totals, job and invoices

Status:
Deferred (until Good/Better/Best estimates are used)

Phase:
3

Problem:
TASK-181 records the customer's pick and the deposit follows it, but a
multi-option estimate still stores a $0 total, and readers of approved lines
disagree: the final invoice and job ledger read only lines with no option
(empty for a multi-option estimate) while convert, work orders, the buy-list
seed and invoice prefill read every option's lines (summing all options).

Scope:
- One shared "approved lines" rule: lines with no option plus the selected
  option's lines, used by final invoice, convert, job ledger, work orders,
  buy-list seed, invoice prefill and reports.
- Set the estimate's subtotal/tax/total from the chosen option on approval,
  with an explicit, tested amendment to the estimate immutability trigger.
- Per-option hourly baseline (added 2026-10-26, owner decision, TASK-188):
  each option has its own hours, direct costs and baseline (low/mid/high, gap,
  effective rate against the cost floor), computed only from lines with no
  option plus that option's lines. Never a combined baseline across options.
  The TASK-188 send rules apply per option: every option must have complete
  hours and confirmed direct costs before the quote can be sent; the cost-floor
  acknowledgment is per option. Until this ships, option quotes are marked
  "Baseline not available for option quotes yet" and skip the new send rules
  (TASK-188, TASK-194).

Acceptance Criteria:
- [ ] Approving Better leaves the job, final invoice, work orders and buy list
      with only Better's work.
- [ ] The approved estimate's total equals the chosen option's total.
- [ ] Standard estimates are unchanged.
- [ ] Each option shows its own baseline; no combined baseline appears
      anywhere.
- [ ] A quote with one option missing hours cannot be sent and the checklist
      names that option.

Notes:
Split from TASK-181 on 2026-10-24 (owner decision). Revisit when the owner
starts sending Good/Better/Best estimates.

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
- [x] Merged to main.
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

# TASK-101: Standalone & Direct Job/Visit Quick Materials Generator (Uncouple Materials from Estimates)

Status:
Done (live — ANTHROPIC_API_KEY set on garonhome; verified 2026-09-04, web
container reaches Anthropic with HTTP 200)

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
In Progress

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
- [x] Job buy-list seed integration: no drywall mud/tape for 1007-only estimates.
- [ ] End-to-end owner flow on live/prod after deploy.

Notes:
CEO+eng review 2026-08-10. Renumbered from accidental TASK-101 (that ID already
shipped as Quick Materials on main #591). Temporary identity = price_book 1007.
Closeout 2026-08-17: takeoff shipped on main (#593) and is deployed (garonhome
at a41f680). Buy-list seed AC covered by `buildSeedLinesFromEstimate` +
`buildManualShoppingList` 1007-only unit tests. Remaining AC is a logged-in
owner pass on https://app.mydovetails.com (create 1007 estimate → seed job
buy list → confirm no mud/tape). Headless browser on this host cannot launch
(Chromium sandbox).

## Completed
- [TASK-187: Itemized materials per work area](../archive/backlog-done/TASK-187-itemized-materials.md) — Done (2026-10-25)
- [TASK-186: Revise the prepared quote with a note](../archive/backlog-done/TASK-186-revise-with-a-note.md) — Done (2026-10-25)
- [TASK-185: Review the prepared quote by work area](../archive/backlog-done/TASK-185-work-area-review.md) — Done (2026-10-25)
- [TASK-184: Wall area and painting hours that match the room](../archive/backlog-done/TASK-184-wall-area-painting-pace.md) — Done (2026-10-25)
- [TASK-182: On approval, request the deposit and start scheduling](../archive/backlog-done/TASK-182-deposit-request-scheduling.md) — Done (2026-10-25)
- [TASK-181: Record the customer's chosen option on approval (guard)](../archive/backlog-done/TASK-181-option-choice-guard.md) — Done as a guard; wiring in TASK-183
- [TASK-180: Price, profitability and proposal from the same draft](../archive/backlog-done/TASK-180-price-profit-proposal.md) — Done (2026-10-24)
- [TASK-100: T&M vs fixed comparison card](../archive/backlog-done/TASK-100-tm-vs-fixed-card.md) — Done, absorbed by TASK-180
- [TASK-179: Prepare Quote from the saved assessment](../archive/backlog-done/TASK-179-prepare-quote.md) — Done (#712, #713, slice 3; 2026-10-24)
- [TASK-178: Door, window and opening counts on assessment rooms](../archive/backlog-done/TASK-178-assessment-room-openings.md) — Done (#711, deployed 2026-10-23)

- [TASK-112: Job materials builder templates](../archive/backlog-done/TASK-112-job-materials-builder-templates.md) — Done (validated 2026-09-09)

- [TASK-018: Assessment Summary Engine](../archive/backlog-done/TASK-018-assessment-summary-engine.md) — Done (Wave 3 2026-08-05)

- [TASK-006: Assessment → Materials Generator Context](../archive/backlog-done/TASK-006-assessment-to-materials-generator-context.md) — Done
- [TASK-007: Assessment → Estimate Context](../archive/backlog-done/TASK-007-assessment-to-estimate-context.md) — Done
- [TASK-082: Job-owned materials buy list (estimate seed)](../archive/backlog-done/TASK-082-job-materials-buy-list.md) — Done (PR #572)
