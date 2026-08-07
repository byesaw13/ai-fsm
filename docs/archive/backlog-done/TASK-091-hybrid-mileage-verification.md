# TASK-091: Hybrid mileage verification pack (odometer + GPS)

Status:
Done

Phase:
1

Problem:
Odometer vehicle sessions and GPS drive segments both exist, and Day Review already
runs `checkMileageDelta`, but the dual path is not a first-class tax story: Timeline
does not show odometer vs GPS corroboration, the Day Review card does not mark
PRIMARY vs corroboration clearly, and there is no accountant export of primary miles +
method + GPS + verification status.

Business Value:
Gives Dovetails a hand-to-accountant taxable mileage line: odometer is the claim,
GPS is the independent check, voids keep history, export proves the dual path.

Scope:
- Shared pure domain helpers for hybrid day summary labels + CSV rows (reuse
  `checkMileageDelta`, `miles_source` labels).
- Day Review Mileage section: vehicle, start→end odometer, PRIMARY badge on
  odometer miles, GPS corroboration miles, verify status (ok / diverged /
  no_gps_coverage).
- Timeline day surface: same hybrid strip for the selected `?date=`.
- Owner/admin CSV export API for a date range: date, vehicle, start/end odo,
  primary miles, method, GPS mi, verify, session id.
- User-scope vehicle sessions by `created_by` when session user is known
  (multi-tech safe); GPS drives for that account/date remain corroboration.
- Unit tests for pure CSV/label helpers and mileage load shape.

Out of Scope:
- New mileage tables or second events store.
- LLM inventing miles or auto-overwriting odometer with GPS.
- Hard-block day close on diverge (soft flag only; optional later).
- Full IRS Schedule C PDF template; CSV is enough for accountant hand-off v1.
- Personal vs business % split (later if needed).

Acceptance Criteria:
- [x] Day Review shows odometer as PRIMARY and GPS as corroboration with verify reason.
- [x] Timeline for a date shows the same hybrid strip.
- [x] CSV export returns one row per non-voided vehicle session in range with
      method + GPS + verify columns.
- [x] `checkMileageDelta` remains the single comparison rule (ok / diverged /
      no_gps_coverage).
- [x] Unit tests cover export formatting and delta wiring.

Notes:
Builds on TASK-027 hybrid tracking, TASK-050 capture method, TASK-080 GPS trail.
Canonical: `docs/canonical/OPERATIONS.md` capture-method trust. ROADMAP Phase 1
infrastructure maintain/extend for tax hand-off, not a new sensor path.

Shipped: PR #582 (2026-08-07).
