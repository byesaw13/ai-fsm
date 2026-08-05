# EPIC-002: Estimating & Assessments

Turning a site assessment into an accurate, defensible estimate with minimal
re-keying, and keeping estimate structure consistent across jobs.

## Active tasks

# TASK-082: Job-owned materials buy list (estimate seed)

Status:
In Progress

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
- [ ] Any active job opens a buy list at `/app/jobs/{id}/materials` without requiring
      an estimate shopping-list URL.
- [ ] Seed from linked estimate (approved preferred, else latest sent) populates lines
      in one explicit action; second seed does not duplicate without re-seed.
- [ ] Re-seed default is add-missing only (match key: case-insensitive name + unit);
      does not auto-bump qty on matches.
- [ ] Purchases tab still shows existing job-linked expenses/receipts.
- [ ] Dashboard / What Next / action-queue materials actions deep-link to the job buy list.
- [ ] Gate: unit tests for pure mappers + seed/reseed rules; typecheck/lint clean for touched packages.
- [ ] Backlog/design: work cites design doc
      `~/.gstack/projects/byesaw13-ai-fsm/nick-main-design-job-materials-plan-20260804.md`
      and eng review locks therein.

Notes:
- Design: office-hours APPROVED 2026-08-04; eng review CLEAR for B1 (scope reduced:
  B1 only + table; kits deferred).
- ROADMAP Phase 3 (estimate → job handoff / production ops). New table is intentional;
  do not use `work_order_materials` for this SOT.
- Follow-on (not this task): B2 kits after operator assignment (5 real jobs: morning
  buy + second-trip items → 3 kit drafts).
- Adjacent: TASK-006/018 materials generator, estimate shopping list (migration 093),
  job materials receipts, catalog receipt learning / supply PO designs — do not break
  purchase actuals.

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

# TASK-018: Assessment Summary Engine

Status:
In Progress

Phase:
3

Problem:
Assessment data is now used by the materials generator, but the broader flow
still needs one reusable assessment summary/context object that can support
materials, estimates, work orders, and invoices without retyping scope.

Business Value:
Reduces duplicate entry, keeps estimate/material/work-order context consistent,
and makes site assessments more valuable.

Scope:
- Define one normalized assessment summary/context shape.
- Ensure the materials generator, estimate creation, work order generation, and
  future invoice summaries can consume the same context.
- Reuse existing assessment-context helpers where possible.
- Preserve manual user edits without overwriting them.
- Document the handoff from assessment to downstream workflows.

Out of Scope:
- Rewriting the AI materials prompt.
- Creating new database tables unless clearly necessary.
- Business Ledger implementation.
- Opportunity tracking implementation.

Acceptance Criteria:
- [ ] A single assessment summary/context shape is documented.
- [ ] Existing assessment-to-materials context is represented in that shape.
- [ ] Estimate creation can consume the same context.
- [ ] Manual scope edits are preserved.
- [ ] Context handoff behavior is documented for future work-order and invoice flows.
- [ ] Tests or manual verification notes cover assessment → materials and
      assessment → estimate flows.

Notes:
This task exists because assessment context is becoming a shared subsystem, not
just a materials-generator patch. Builds on `apps/web/lib/estimates/assessment-context.ts`
(see TASK-006, TASK-007). Closely related to TASK-007; TASK-018 owns the shared
context *shape*, while TASK-007 covers the estimate-entry consumption.

Slice 1 shipped: canonical `AssessmentSummary` + `AssessmentRoom` +
`buildAssessmentSummary` in `packages/domain/src/assessment-summary.ts`; a
server-side `loadAssessmentSummary` / `mapRowToAssessmentSummary`
(`apps/web/lib/estimates/assessment-summary-loader.ts`) derives it from
`site_visit_assessments`; the web `AssessmentContext` is a thin `Pick<>` of the
canonical summary and `RoomMeasurement` aliases `AssessmentRoom` (no duplicate
shapes).

Slice 2 shipped: the estimate page recovers the assessment summary from
persistence when the sessionStorage hand-off is missing (refresh / deep-link) —
`resolveAssessmentContext` (sessionStorage wins, else the server-loaded summary),
the assessment→estimate URL now carries `visit_id`, and `preserveScope` makes the
manual-edit guard a tested pure rule. A pure `buildWorkOrderDraft`
(`packages/domain/src/work-order.ts`) maps a summary → work-order draft but is
NOT wired into any UI. Owner edits preserved.

Slice 3 shipped: a real, persisted `work_orders` entity (+ `work_order_materials`
child) created from a site assessment. `buildWorkOrderDraft(summary)` →
`{ title, scope, siteNotes, safetyNotes, roomBreakdown, materials }`
(`packages/domain/src/work-order.ts`); migration `db/migrations/125_work_orders.sql`
(account RLS, status lifecycle draft→scheduled→in_progress→completed→cancelled,
`property_id` + `completed_at` + materials child kept for the Slice 4 timeline UNION);
API `apps/web/app/api/v1/work-orders/` (GET/POST + `[id]` GET/PATCH); a Work Order
Create/Edit screen (`apps/web/app/app/work-orders/`) where the owner edits everything,
materials are a happy medium (AI-suggested via the estimate materials generator, owner
confirms/edits, or adds manually), plus a status-grouped list and a "Work Orders" nav
item. Entry point: assessment page (being repositioned to draft-only per
`docs/superpowers/specs/2026-07-01-job-work-order-visit-model-design.md` — Slice 0
canon + Slice 4 guardrails). Owner edits preserved.

**Architecture follow-on (Slice 0 canon approved 2026-07-01):** `jobs` = **Project**
in UI; work orders sit between projects and visits; assessment → **draft** work order
only (no orphan operational path); estimate acceptance → project + default work order.
See spec for full model. Schema/enforcement slices 1–5 shipped 2026-07-01
(`137_project_work_order_visit_schema.sql` + app slices 2–5).

Slice 4 shipped: completed work orders feed the Property Timeline. Migration
`db/migrations/126_property_timeline_work_orders.sql` adds a `work_order` arm to
`property_timeline_v` (status='completed', `occurred_at=completed_at`, `total_cents`,
`link_id` → work order, `detail` = materials-used summary, metadata carries
`materials` + `materials_count`); the property page renders it via a "Work Order"
event type (`apps/web/app/app/properties/[id]/PropertyTimeline.tsx`) linking to
`/app/work-orders/<id>`, and the timeline API allows the `work_order` filter. So a
completed work order now shows on the property: what was done, when, materials used,
and total.

Assessment-powered materials generator shipped: the materials generator now
consumes the canonical `AssessmentSummary` as its primary context.
`/api/v1/estimates/ai-materials` accepts `assessment_id` / `visit_id` (loads the
summary server-side via `loadAssessmentSummary` / `loadAssessmentSummaryById`) or a
client `assessment_summary` fallback; `scope`/`job_type` are optional and derived
from the summary when absent. The canonical `AssessmentSummary` gained
`workItems` / `prepNotes` / `tradeNotes` / `customerSuppliedMaterials` (no new
tables — populated when capture exists). The prompt now uses the assessment as the
source of truth: converts room/prep notes into consumables, excludes
customer-supplied materials from the purchase list, and flags missing measurements
instead of guessing. `MaterialsResult` gained `assumptions`,
`missing_measurements`, and `excluded_customer_supplied_items`. Price-book matching
preserved; the non-assessment scope/rooms flow still works; generation stays
side-effect-free so owner-edited materials are never overwritten. Both callers
(estimate `MaterialsGenerator`, work-order `WorkOrderForm`) pass the source
`visit_id`/`assessment_id`.

Remaining (In Progress): make persistence the *primary* estimate source (not just
a fallback); capture `work_items` / `prep_notes` / `trade_notes` /
`customer_supplied_materials` on the assessment form (the summary contract and
generator already consume them); surface the new `assumptions` /
`missing_measurements` / `excluded_customer_supplied_items` in the materials UI;
warranty tracking, opportunities, and invoice generation from a work order.

## Completed

- [TASK-006: Assessment → Materials Generator Context](../archive/backlog-done/TASK-006-assessment-to-materials-generator-context.md) — Done
- [TASK-007: Assessment → Estimate Context](../archive/backlog-done/TASK-007-assessment-to-estimate-context.md) — Done
