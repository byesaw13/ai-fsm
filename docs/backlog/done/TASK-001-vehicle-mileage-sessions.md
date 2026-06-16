# TASK-001: Vehicle Mileage Sessions

Status:
Done

Problem:
Mileage was tracked as if a day had a single vehicle, making it easy to log
miles against the wrong vehicle and impossible to switch vehicles without ending
the day. Bad odometer history contaminates tax mileage, vehicle cost, and job
profitability — and is hard to clean up after the fact.

Business Value:
Accurate, per-vehicle odometer history is the foundation for trustworthy tax
mileage, vehicle cost tracking, and job profitability.

Scope:
- Vehicle sessions are the source of truth for odometer movement.
- One Daily Operations Log can hold multiple vehicle sessions.
- Per-vehicle odometer floor: a start cannot move a vehicle's odometer backward
  outside an explicit correction.
- Switch vehicles mid-day (close current, open new) without ending the day.

Out of Scope:
- Job-level mileage allocation from sessions/activities (future).
- Business Ledger.
- Dropping legacy `mileage_logs` / miles-only entry.

Acceptance Criteria:
- [x] A day can carry multiple vehicle sessions.
- [x] Start odometer must be >= the vehicle's last known reading (unless
      correcting).
- [x] Vehicle switch closes the current session and opens a new one, day still
      running.
- [x] Confirmation before committing any vehicle selection.

Notes:
Shipped in PRs #312 and #313. Migration `db/migrations/113_vehicle_session_lifecycle.sql`;
helpers `apps/web/lib/mileage/sessions.ts`; routes under
`apps/web/app/api/v1/sessions/*`; UI `CurrentVehiclePanel` in
`apps/web/app/app/DailyCommandCenter.tsx`.
