# TASK-229: Retire the painting parity adapter

Status:
In progress (PR open 2026-11-01). Owner decision 2026-11-01: "remove the old one",
so the engine rules price room-by-room labor and the $/sq ft total goes.

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-193 (doctrine Rule 3 deferred from PR 2)

Severity:
Low, latent (no room-by-room painting estimates in production yet).

Problem:
`packages/domain/src/estimate-engine/adapters.ts` `roomSpecsToEstimateSpec` prices
rooms with the engine, then adds a "Pricing reconciliation" adjustment so the total
equals the old `computePaintingProject` ($/sq ft) total. The room-by-room editor
preview (`RoomByRoomEditor.tsx`) and the shopping list
(`buildShoppingListFromEstimateResult`) also read `computePaintingProject`. Two
pricing models run for one quote, and the customer sees a reconciliation line.
Doctrine Rule 3 says to retire this when touched. TASK-193 PR 2 touched it but
did not retire it, because removing it changes room-by-room prices.

Scope:
- Owner decides which price wins for room-by-room painting: engine rules, the
  $/sq ft constants, or hours from production rates (TASK-193) times the labor rate.
- Remove the parity adjustment and the remaining `computePaintingProject` callers
  in the same change; keep `computeRoomMeasurements` (areas) in one place.
- Paint gallons and the shopping list come from one calculation.

Acceptance Criteria:
- [x] A room-by-room quote has no "Pricing reconciliation" line.
- [x] `computePaintingProject` has no callers outside tests, or is deleted (deleted).
- [x] Preview total, saved lines and saved total agree (one spec builder feeds all three).

As built (2026-11-01):
- `computePaintingProject` and `computeRoomPainting` are deleted from
  `packages/domain/src/painting.ts`. `computePaintingMaterials(rooms, options)`
  keeps only paint and primer: gallons by grade at the real coat count,
  primer (two passes for dark to light), none for customer-supplied rooms.
- `EstimateSpec.roomMaterials` (engine): when set, the rooms add no paint of
  their own; the items become material lines plus one handling line. The old
  engine paint guess used the engine coat number (1 for a 2-coat job), so it
  under-bought paint; that is why the parity line existed.
- `roomSpecsToEstimateSpec` no longer adds the "Pricing reconciliation"
  adjustment. The shopping list reads `computePaintingMaterials` too.
- Price effect: a standard 2-coat bedroom (12x12x8, ceiling and trim) is
  $1,241.90 before and after; the paint line now says 4 gal instead of 3 plus
  a $63.25 reconciliation. Rooms with primer now carry the engine's prime
  labor multiplier (+20%) as well as primer material. Customer-supplied rooms
  no longer pay for paint through the reconciliation.
- Production had no estimates with room specs or a parity line (checked
  2026-11-01: 0 of 41), so no saved quote changes.

Related:
TASK-199 (painting edit uses account rates), TASK-201 (room-by-room save is atomic).
