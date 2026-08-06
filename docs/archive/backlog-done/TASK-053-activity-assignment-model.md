# TASK-053: Activity + Assignment model

Status:
Done

Phase:
1

Problem:
Activity today conflates the verb (driving, working) with the business object
(Job #241), so "same job, switched task" can't be expressed cleanly.

Business Value:
Clean job-costing: Activity = verb, Assignment = object; labor_bucket derives.

Scope:
- Extend `activity_entries` (migration 129, additive): `business_day_id`,
  `time_clock_session_id`, `labor_bucket (billable|overhead|personal|warranty)`,
  non-entity `assignment_kind (office|shop|inventory|training|none)`.
- Reuse `entity_type/entity_id` as the assignment link; extend the activity-verb
  enum + labels in `packages/domain/src/activities.ts`; map activity+assignment →
  labor_bucket. Reuse `/api/v1/activities/switch` for Change Activity/Assignment.

Out of Scope:
- Current Operations State (TASK-056); presence (TASK-057).

Acceptance Criteria:
- [x] Activity verb and Assignment object are independently settable.
- [x] labor_bucket mapping is a unit-tested pure rule.
- [x] Switching keeps payroll running; one-active invariant preserved.

Notes:
Phase 3.

Notes (Wave 0a close):
Wave 0a verify 2026-08-05: PASS.
Evidence: packages/domain laborBucketFor + activities.test.ts (10 tests pass);
POST /api/v1/activities/switch with entity XOR assignment_kind; ActivityTracker/ClockBar
switch; one-active FOR UPDATE close+insert; payroll clock not required to switch.
