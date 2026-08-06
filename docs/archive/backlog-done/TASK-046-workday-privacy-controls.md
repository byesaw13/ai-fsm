# TASK-046: Workday & privacy controls

Status:
Done

Phase:
1

Problem:
Passive tracking needs guardrails.

Scope:
- Tracking active only during the workday; a pause-tracking control; hide
  private/home locations from reports; raw GPS retention window (30–90 days);
  confirmed ledger entries kept permanently.

Acceptance Criteria:
- [x] Tracking can be paused and is bounded to the workday. (slice 1, PR #373)
- [x] Home/private locations don't surface in reports; raw GPS ages out on
      schedule while confirmed entries persist. (slice 2, Phase 1)

Notes:
Slice 1 (PR #373): master enable/disable + pause + Start-Day workday gating.
Slice 2: `isPrivateLocation` report filtering, worker retention prune, settings UI.

Notes (Wave 0a close):
Wave 0a verify 2026-08-05: PASS. ACs already checked in epic.
Evidence: location-settings API; privacy gate (no_active_workday); isPrivateLocation
in day-review; worker prune-location-events + location_retention_days tests.
README already listed Done; epic was stale In Progress.
