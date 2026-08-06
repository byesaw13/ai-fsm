# EPIC-002: Estimating & Assessments

Turning a site assessment into an accurate, defensible estimate with minimal
re-keying, and keeping estimate structure consistent across jobs.

## Active tasks

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
