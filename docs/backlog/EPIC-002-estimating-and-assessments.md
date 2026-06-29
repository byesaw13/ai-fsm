# EPIC-002: Estimating & Assessments

Turning a site assessment into an accurate, defensible estimate with minimal
re-keying, and keeping estimate structure consistent across jobs.

## Active tasks

# TASK-008: Room-Based Estimate Templates

Status:
Proposed

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
item. Entry point: a "Create Work Order →" button on the assessment page. Owner edits
preserved.

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

- [TASK-006: Assessment → Materials Generator Context](done/TASK-006-assessment-to-materials-generator-context.md) — Done
- [TASK-007: Assessment → Estimate Context](done/TASK-007-assessment-to-estimate-context.md) — Done
