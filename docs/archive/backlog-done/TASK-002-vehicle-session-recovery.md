# TASK-002: Vehicle Session Recovery

Status:
Done

Problem:
If a vehicle was left with an open/incomplete session (e.g. the end odometer was
never entered), the owner could not cleanly start a new session for that vehicle.

Business Value:
Prevents orphaned open sessions and missing odometer readings that corrupt
downstream mileage totals.

Scope:
- Detect an open prior session for a vehicle when starting a new one.
- Prompt to enter the missing end odometer (defaulted to the proposed start,
  requiring confirmation) before continuing.
- Reconcile pre-existing duplicate open sessions during migration without
  deleting attached activities.

Out of Scope:
- Automatic guessing of the true end odometer.

Acceptance Criteria:
- [x] Starting a session for a vehicle with an open prior returns a recoverable
      prompt (`INCOMPLETE_PRIOR_SESSION`) carrying the open session id.
- [x] The missing end odometer can be supplied to close the prior session, then
      the new one starts.
- [x] Migration closes (not deletes) superseded duplicate open sessions,
      preserving their activities.

Notes:
Shipped with TASK-001 (PRs #312/#313). See `apps/web/app/api/v1/sessions/start/route.ts`
and the reconciliation step in `db/migrations/113_vehicle_session_lifecycle.sql`.
