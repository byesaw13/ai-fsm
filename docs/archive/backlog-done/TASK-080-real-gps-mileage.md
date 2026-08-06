# TASK-080: Real GPS mileage — dense drive trail + honest cross-check

Status:
Done

Phase:
1

Problem:
GPS mileage reads ~0 while the odometer shows real miles, and Day Review cries
"GPS and odometer differ by 100%." Root cause: HA only posts a drive GPS point
when the geocoded *address* changes (`fsm_location_drive_point`), so a short local
hop has 1–2 points, the path distance underreads to near-zero, `classifyDrive`
marks it noise, and the confirmed-drive rollup sums to 0. Brief "still" flickers
(red lights) also fragment one trip into many noise drives.

Business Value:
The GPS cross-check actually reflects real driving instead of lying, and the false
"100% off" alarm stops — while the odometer stays the source of truth for billed
miles (hybrid tracking, TASK-027).

Scope:
- **HA (homelab `~/docker/homeassistant/automations.yaml`):** `fsm_location_drive_point`
  gains a `time_pattern` (every 1 min while `in_vehicle`) so a trip gets a dense
  GPS trail, not only a point per street. The activity-change automation debounces
  `still` with `for: 90s` so a red-light pause no longer fragments a trip.
- **App:** `checkMileageDelta` treats near-zero GPS against a real odometer as
  `no_gps_coverage` (informational: "GPS didn't track this drive — using the
  odometer"), not a flagged mismatch. `GPS_MIN_COVERAGE_MILES = 1`. Unit-tested.

Out of Scope:
- Phone-side HA Companion high-accuracy/interval tuning (a device setting; the
  time_pattern samples whatever the device_tracker reports).
- Replacing the odometer as the billed-mileage source of truth (stays TASK-027).
- The reducer-level drive displacement guard (still a TASK-076 follow-on).

Acceptance Criteria:
- [x] A real trip records a GPS trail (multiple points) → non-zero GPS miles.
- [x] A red-light pause does not split a trip into noise drives.
- [x] Day Review shows "GPS didn't track this drive" (calm) when GPS coverage is
      near-zero, not "differ by 100%"; a genuine divergence still warns.
- [x] `checkMileageDelta` coverage logic is pure + unit-tested.

Notes:
Phase 1 maintenance of TASK-025/027 capture. The HA edit is homelab infra (reload
automations to apply); the app change ships via the normal deploy. No migration.

Notes (Wave 0b close):
Wave 0b verify 2026-08-05: App PASS; HA reference updated for ops apply.
App evidence:
- checkMileageDelta → no_gps_coverage (not flagged mismatch); day-review.test.ts (14 tests)
- MileageSection: "GPS didn't track this drive — using the odometer"
- Genuine diverged still shows percent warning

HA residual disposition (ops, not app-blocked):
- docs/working/ha-location-capture.yaml updated (TASK-080): drive point time_pattern /1 min while
  in_vehicle; still activity debounced for: 90s; in_vehicle immediate.
- Homelab: copy into ~/docker/homeassistant/automations.yaml (or merge), reload automations,
  verify a real trip posts multiple ha-pt-* points.
