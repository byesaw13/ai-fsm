# TASK-054: Day Close checklist + Reopen

Status:
Done

Phase:
1

Problem:
The blunt End Day button closes everything at once with no review.

Business Value:
A deliberate close after review; Reopen is normal, not an error.

Scope:
- Checklist gating `business_days → CLOSED` (payroll, activities, mileage,
  materials/expenses, inbox cleared/deferred, notes). Reopen with reason → ACTIVE.

Out of Scope:
- Locking historical records on close.

Acceptance Criteria:
- [x] Close requires the checklist; Reopen records a reason (→ REOPENED working path). Soft inbox/notes gates deferred.

Notes:
Phase 7.


Notes (archive 2026-08-06 code audit):
Implemented: DayCloseChecklist, close-status hard gates (open clock/activity/mileage),
business-day transition + day-review close, reopen with reason, domain tests + e2e.
Residual soft rows (inbox/expenses/notes) intentionally deferred.

**Known residual (follow-up):** Open vehicle-session gate is account/date scoped,
not per-user — multi-tech same day can block each other's close. Prefer scoping
by session owner (`created_by` / user_id) in a small fix PR, not reopening this
task's core close+reopen AC.
