# TASK-003: Wrong Vehicle Correction

Status:
Done

Problem:
If the owner selected the wrong vehicle for a mileage session, there was no way
to fix it without corrupting odometer history.

Business Value:
Lets a genuine mistake be corrected cleanly while preserving an audit trail, so
per-vehicle history stays accurate.

Scope:
- "Change vehicle for this mileage session" action.
- Re-validate the odometer against the newly selected vehicle's history.
- Require a correction reason when changing a completed session.
- Preserve an audit trail.

Out of Scope:
- Bulk re-assignment of historical sessions.

Acceptance Criteria:
- [x] A session's vehicle can be changed and the odometer is revalidated against
      the new vehicle.
- [x] A reason is required to change a completed session.
- [x] The change is recorded in the audit log.

Notes:
Shipped with TASK-001 (PRs #312/#313). See
`apps/web/app/api/v1/sessions/[id]/correct-vehicle/route.ts`; confirmation flow
in `CurrentVehiclePanel` (`apps/web/app/app/DailyCommandCenter.tsx`).
