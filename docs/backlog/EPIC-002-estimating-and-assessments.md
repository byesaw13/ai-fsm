# EPIC-002: Estimating & Assessments

Turning a site assessment into an accurate, defensible estimate with minimal
re-keying, and keeping estimate structure consistent across jobs.

## Active tasks

# TASK-007: Assessment → Estimate Context

Status:
In Progress

Problem:
Assessment findings (conditions, scope, measurements) should flow into the
estimate so the estimator is not re-entering what was already captured on site.

Business Value:
Less double-entry, fewer transcription errors, and estimates that reflect the
actual site condition.

Scope:
- Carry assessment context into estimate entry and prefill where it is reliable.
- Consume-and-clear context so stale assessment data is not reused on a later
  estimate.

Out of Scope:
- Full room-by-room template system (TASK-008).
- Estimate versioning (TASK-009).

Acceptance Criteria:
- [ ] Assessment context populates the estimate draft.
- [ ] Context is cleared after use so it cannot leak into an unrelated estimate.

Notes:
Shared logic in `apps/web/lib/estimates/assessment-context.ts` and
walkthrough prefill already exist; consume-and-clear has landed. Remaining work
is coverage and edge cases.

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

## Completed

- [TASK-006: Assessment → Materials Generator Context](done/TASK-006-assessment-to-materials-generator-context.md) — Done
