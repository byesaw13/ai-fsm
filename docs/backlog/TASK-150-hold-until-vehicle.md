# TASK-150: Hold the stop until Bluetooth / zone / different property

**Epic:** 007 (Field Execution / location capture)
**Status:** In Progress

## Problem

2026-09-18 at 4 Ash: one park (09:01 disconnect) and one leave (17:42 connect),
but Day Review filled with 4 Ash / 2 Ash / 8 Bus Rd / 69 N Policy / Brookdale
cards. TASK-148 splits on GPS `still` outside ~80 m. Reverse-geocode flicker on
a tight block looks like leaving. HA also sent `in_vehicle` while sitting on
site (09:05–10:08 fake drive).

Bluetooth hold was discussed, not built. TASK-149 only prompts on disconnect.

## Fix

Hold the open stop until a real leave:

- **Vehicle connect** ends the dwell (drive).
- **Named zone** (Home Depot, home) still splits.
- **`still` at a different known property** splits (next job).
- **`still` with a neighbor geocode** (8 Bus Rd, N Policy) does **not** split.
- Phone `in_vehicle` while already stopped does **not** open a drive. That is
  not Bluetooth.

The 5-minute GPS floor and park prompt (TASK-149) stay.

- [x] `in_vehicle` while stopped is a no-op.
- [x] `still` outside the fence is a no-op unless `differentProperty`.
- [x] `isDifferentPropertyStill` unit-tested (same house flicker vs other job).
