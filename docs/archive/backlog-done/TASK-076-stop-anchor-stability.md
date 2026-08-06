# TASK-076: Stop anchor stability — radius hysteresis on capture

Status:
Done

Phase:
1

Problem:
The segmentation reducer (`reduceLocationEvent`, `apps/web/lib/location/segments.ts`)
has no radius hysteresis — it reacts only to discrete event kinds. For a zone-less
GPS stop, every `location_update` overwrites the stop's `latitude`/`longitude` and
can re-flip `place_label` (the `location_update` case, ~L245–251). So GPS jitter
while parked walks the stop's pin around and flickers the geocoded address
("123 Main St" ↔ "125 Main St"). Minor location noise is recorded as movement.

Business Value:
A parked stop stays anchored to where you actually parked; the pin and address
stop drifting. That means less review noise and — because a property's coordinates
are *learned from confirmed stops* (TASK-041) — more trustworthy coords feeding the
customer-matching engine.

Scope:
- In the `location_update` case, when the open stop already has anchor coords,
  compute `haversineMeters(anchor, incoming)` (helper already in `packages/domain`)
  and treat anything within a small radius (`STOP_ANCHOR_RADIUS_M`, ~40 m; one
  tunable constant) as no movement → `NO_OP`, skipping the coord/label rewrite.
- Keep first-fix enrichment: a stop still missing coords/label is still filled by
  the first usable update; the debounce only applies once anchored.
- Optional: the same displacement guard before an `activity_change: still →
  in_vehicle` opens a drive, so a parked activity flicker doesn't spawn a churn
  drive (`classifyDrive` dismisses that noise post-hoc; this prevents the row).

Out of Scope:
- A stop that genuinely relocates (a block over) — that still becomes a new stop
  via a zone/activity transition, unchanged.
- Drive distance math (`pathDistanceMeters`/`haversineMeters` on drive close).

Acceptance Criteria:
- [x] Repeated `location_update` pings within the radius of an anchored stop do
      not change its lat/long or `place_label`.
- [x] A stop still missing coords/label is still enriched by the first usable update.
- [x] The radius is a single tunable constant; the guard is unit-tested in
      `segments.test.ts` (jitter within radius = `NO_OP`; a real move = update).

Notes:
Phase 1 maintenance of TASK-024 capture (the freeze permits maintenance, not scope
expansion). Reuses `haversineMeters`; no migration. Pure-reducer change, so fully
unit-testable.


Notes (archive 2026-08-06 code audit):
`STOP_ANCHOR_RADIUS_M = 40` in apps/web/lib/location/segments.ts;
haversine near-anchor freezes coords; unit tests in segments.test.ts.
Optional still→in_vehicle drive guard not required for Done.

**Product nuance (accepted):** Within radius, **pin coords freeze**; geocoded
`place_label` may still refine when a delayed reverse-geocode returns. That is
deliberate first-fix/settle behavior for address accuracy, not reopening pin
walk. If address flicker remains annoying, suppress label rewrites when
`nearAnchor` as a micro-follow-up.
