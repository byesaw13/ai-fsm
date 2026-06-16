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

## Completed

- [TASK-006: Assessment → Materials Generator Context](done/TASK-006-assessment-to-materials-generator-context.md) — Done
- [TASK-007: Assessment → Estimate Context](done/TASK-007-assessment-to-estimate-context.md) — Done
