# TASK-106: False-stop detection (5-minute dwell floor)

Status:
Done

Phase:
1

Problem:
HA Companion `still` / `in_vehicle` and zone flicker open a stop on every
transition. `classifyDrive` auto-dismisses drive noise; stops were never
classified. TASK-079's 3-minute floor only gated `visit_candidates`, so
0–4 minute address blips still piled up as provisional items on the time log
(~7–20 things to tap through on a busy day).

Business Value:
The owner only reviews real stays and trips. HA turbulence under 5 minutes
clears itself unless a scheduled visit was there.

Scope:
- Pure `classifyStop` (packages/domain): noise under 5 minutes, ok at/over
  5 minutes or when a scheduled visit is attached.
- Apply at capture: auto-dismiss noise stops (`is_likely_noise` +
  `status = dismissed`).
- Raise `VISIT_CANDIDATE_MIN_DWELL_MINUTES` to 5 so it shares the same floor.
- One-time backfill of existing provisional short stops (migration 172),
  including pending unscheduled visit-candidate cards on those stops.

Out of Scope:
- Merging split same-place stops around a dismissed noise drive.
- Auto-confirming real drives or Home overnight stays.
- Changing HA automations (raw feed stays honest; FSM processes it).

Acceptance Criteria:
- [x] A closed stop under 5 minutes with no scheduled visit is auto-dismissed.
- [x] A brief stop at a scheduled visit today stays on the confirm list.
- [x] Existing provisional short stops are backfilled by the migration.
- [x] `classifyStop` is unit-tested against the real-data examples.

Notes:
The stop sibling of TASK-040. Thresholds live in `classifyStop`;
migration 172's backfill mirrors them.

Shipped: PR #601 (2026-08-15). Truth-pass archive 2026-08-17.
