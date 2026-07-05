# TASK-025: Bluetooth-triggered, vehicle-aware auto-mileage

Status:
Done

Phase:
1

Problem:
Mileage is still entered by hand (start/end odometer per vehicle session). The
owner wants trips logged automatically and attributed to the right vehicle,
without thinking about it. No vehicle telematics are available (the RAM has no
usable HA integration), but the phone's Bluetooth tells us which vehicle he is
in and exactly when the engine is on.

Business Value:
- Hands-off mileage capture per vehicle → trustworthy tax mileage and vehicle
  cost without manual odometer entry.
- Precise trip boundaries (ignition on/off) instead of guessed-from-motion.

Approach:
Extend TASK-024. The HA Companion app's `sensor.<phone>_bluetooth_connection`
identifies the connected car stereo. An HA automation maps a known vehicle BT
identity → a vehicle and posts to the FSM ingest:
- **connect** to a known vehicle BT → open a drive segment tied to that vehicle.
- **disconnect** → close the drive; compute distance from the drive segment's GPS
  and surface an **estimated trip mileage the owner confirms** (not auto-written —
  GPS distance is an estimate) before it writes to that vehicle's
  `vehicle_sessions` / `mileage_logs`.

Vehicle BT map (see also the agent memory note):
- RAM 2019 (plate DOVETLS, work truck) → "Uconnect" / `00:22:A0:A6:49:0D`
- GMC Acadia 2018 → "GMC INTELLILINK" / `30:C3:D9:19:1E:C3`
Decision: **both** vehicles auto-track, each attributed to its own record; miles
are **owner-confirmed**, not auto-written.

Scope:
- Vehicle BT identity → `vehicles` row mapping (config; both vehicles).
- Ingest: accept a vehicle identifier + a Bluetooth connect/disconnect signal;
  associate the resulting drive segment with the vehicle. Likely a small additive
  migration (vehicle reference on `location_segments`) + a new event kind.
- Distance: compute trip miles from the drive segment's GPS (route between
  start/end, or accumulate points). Document the estimate accuracy.
- Confirm UI: on the timeline/mileage surface, present the auto-captured trip +
  estimated miles for one-tap confirm (or edit) → writes the vehicle session.
- HA automation watching the bluetooth_connection sensor + runbook.

Out of Scope:
- Auto-writing miles with no confirmation (explicitly rejected).
- Vehicle telematics / OBD / odometer (none available; GPS estimate is the method).
- Multi-driver attribution (single-owner first).

Acceptance Criteria:
- [x] Connecting the phone to a known vehicle's Bluetooth opens a vehicle-tagged
      drive; disconnecting closes it.
- [x] The closed trip surfaces estimated miles attributed to the correct vehicle.
- [x] Owner confirms/edits the miles in one tap → writes a `vehicle_sessions` /
      `mileage_logs` entry; nothing is written without confirmation.
- [x] GPS-estimate accuracy + method documented.

Prerequisites / Notes:
- Both the RAM and GMC must exist as rows in the FSM `vehicles` table to attach
  sessions (RAM likely already does).
- Confirm what `connected_paired_devices` actually contains once the sensor
  populates (friendly name vs MAC) so the automation matches correctly.
- Builds directly on TASK-024 (`location_segments`, the ingest, the timeline).

Notes:
Archived during north-star reconciliation (2026-07-03). Shipped in
`db/migrations/115_drive_mileage.sql` and Bluetooth ingest in
`apps/web/app/api/internal/location/route.ts`. Mileage confirmation UI later
superseded by hybrid model (TASK-027); BT vehicle tagging and GPS estimates
remain live.