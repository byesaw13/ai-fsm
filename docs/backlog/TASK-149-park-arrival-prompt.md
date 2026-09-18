# TASK-149: Park (Bluetooth disconnect) → confirm location

**Epic:** 007 (Field Execution / location capture)
**Status:** Done (PR #657)

## Problem

GPS will not treat a stop as a visit until 5 minutes on site (TASK-106). That
keeps flicker out of Day Review, but it is too late for “I just parked at the
job.” The live “You’re on site” push currently fires when a **stop closes**
(you leave), not when the van shuts off.

## Fix

Bluetooth disconnect is the arrival signal. On `vehicle_disconnect`, match
current GPS to open/scheduled jobs (same geofence as TASK-148). If it is a
distance-proven job, create the pending candidate immediately (skip the 5-minute
dwell) and push “You’re on site” with the existing My Work confirm button.

The 5-minute floor stays for GPS-only `still` / location_update. A 30-second
false park that is not confirmed is still dismissed as noise on close.

Vehicle **connect** still ends the dwell (drive). It does not auto-start the
next job clock.

- [x] `shouldCreateVisitCandidate({ parkedArrival })` skips the dwell floor
      when distance is known (unit-tested).
- [x] Ingest: on `vehicle_disconnect`, run visit match + live prompt against
      the open (or just-opened) stop. Reuse existing push + `/app/my-work?proposal=`.
- [x] Close-path prompt still fires at most once (`was_inserted` / live_prompted_at).

## Out of scope

- Auto-start `job_work` (TASK-077).
- Hold-until-vehicle-connect walking (follow-on).
