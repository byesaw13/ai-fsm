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
  pattern (e.g. "decking is consistently under") worth building calibration
  against — the actual deliverable of this task, not a specific event firing.

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

## Completed

- [TASK-018: Assessment Summary Engine](../archive/backlog-done/TASK-018-assessment-summary-engine.md) — Done (Wave 3 2026-08-05)

- [TASK-006: Assessment → Materials Generator Context](../archive/backlog-done/TASK-006-assessment-to-materials-generator-context.md) — Done
- [TASK-007: Assessment → Estimate Context](../archive/backlog-done/TASK-007-assessment-to-estimate-context.md) — Done
- [TASK-082: Job-owned materials buy list (estimate seed)](../archive/backlog-done/TASK-082-job-materials-buy-list.md) — Done (PR #572)
