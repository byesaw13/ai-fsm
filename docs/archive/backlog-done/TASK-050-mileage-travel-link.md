# TASK-050: Link mileage ↔ travel-time + capture-method + reconcile

Status:
Done

Phase:
1

Problem:
`vehicle_sessions` had no link to travel-time, no record of how a mileage number
was captured, and a drive could be logged twice (manual odometer + auto GPS).

Business Value:
Trustworthy mileage: one tap yields linked mileage + travel-time, every number
shows its capture method, duplicates reconcile.

Scope:
- Extend `vehicle_sessions` (migration 130, additive): `business_day_id`,
  `activity_entry_id` FK, `miles_source`, `status (open|closed|voided)`.
- Hybrid "Confirm trip" in `activities/segments/[id]`: atomic travel entry +
  linked session + segment stamp; odometer-vs-GPS reconcile.

Out of Scope:
- BT pre-fill UI (via TASK-025).

Acceptance Criteria:
- [x] Confirming a drive yields one travel entry + one linked session; idempotent.
- [x] Enclosing odometer close offers reconcile and voids GPS estimates.
- [x] Capture method recorded and shown.

Notes:
Epic already marked Done with ACs checked; README index had lagged as Proposed.
Truth-pass archive 2026-08-05.
