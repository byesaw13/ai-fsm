# TASK-052: Payroll clock + payroll policies

Status:
Done

Phase:
1

Problem:
There is no record of paid working time distinct from what task was being done.

Business Value:
Employee-style "was this person working?" time, independent of activity — the
basis for payroll and true labor burden.

Scope:
- New `time_clock_sessions` table (migration 128): business_day_id, clock_in/out,
  status, `pay_type (hourly|salary|piecework|subcontractor|owner_draw)`,
  hourly_rate_snapshot, break_policy, voided_at, correction_reason.
- All pay types derive from the one clock; only the calculation differs.
- Field Clock In / Clock Out; after clock-in prompt "What are you doing now?".

Out of Scope:
- Payroll calculation/payout; activity coupling (must stay independent).

Acceptance Criteria:
- [x] Clock spans many activities; switching activity never touches the clock.
- [x] Corrections void + re-add, never delete.
- [x] Account-scoped RLS; additive migration.

Notes:
Phase 2.

Code audit 2026-08-06: **PARTIAL** — clock in/out, migration 129,
ClockBar, day-close gate shipped. Residual: void/correct clock UI; pay policy fields.

Closed 2026-09-04: pay-policy fields already shipped in migration 129
(`pay_type`, `hourly_rate_snapshot_cents`, `break_policy`). The void/correct
clock UI is now built — a "Fix times" panel under ClockBar lists today's (and
any still-open) sessions with per-session **Correct** (void + re-add corrected
times) and **Void**, each requiring a reason and writing an audit-log entry.
Service: `listTodayClocks` / `voidClock` / `correctClock`
(`lib/operations/time-clock.ts`); routes `GET /api/v1/time-clock/today`,
`POST /api/v1/time-clock/[id]/{void,correct}`; validator
`validateClockCorrection` (`packages/domain/src/payroll.ts`, unit-tested).


