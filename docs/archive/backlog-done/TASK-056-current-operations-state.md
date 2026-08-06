# TASK-056: Current Operations State (live state machine)

Status:
Done

Phase:
1

Problem:
Nothing describes the user's current operational state, so automation has to
search/reconstruct context every time.

Business Value:
The app always knows NOW (clocked-in? · activity · assignment · vehicle ·
presence · pending question), making one-tap automation cheap.

Scope:
- A derived read-model (one API) computed from the open rows (clock session,
  activity entry, vehicle session, latest presence) — derive-first, no
  sync-prone cache table unless proven necessary.
- Expose current state + valid transitions; power proactive prompts.

Out of Scope:
- The inbox UI (TASK-049); persisting state history.

Acceptance Criteria:
- [x] One endpoint returns the live state from open records.
- [x] State transitions are documented and unit-tested.

Notes:
Phase 3. Pairs with TASK-053.

Notes (Wave 1 ship 2026-08-05):
- GET /api/v1/operations/current — derive-only via getCurrentOperationsState + withDbSession
- Multi-user scope: activity_entries.user_id + vehicle_sessions.created_by
- ActivityTracker NowBar fetches ops state (display: payroll clock on/off + data-ops-* attrs)
- Unit tests: state.unit.test.ts multi-user; route.unit.test.ts 200/500

Follow-up in same PR (Codex P1/P2):
- Migration 168: one open activity per (account_id, user_id)
- switch/stop + visit auto-activity scoped by user_id
- deriveValidTransitions: switch_activity always; stop_activity when active
- ActivityTracker listens for ops:refresh
