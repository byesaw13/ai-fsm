# TASK-229: Retire the painting parity adapter

Status:
Proposed (needs an owner pricing decision)

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
- [ ] A room-by-room quote has no "Pricing reconciliation" line.
- [ ] `computePaintingProject` has no callers outside tests, or is deleted.
- [ ] Preview total, saved lines and saved total agree.

Related:
TASK-199 (painting edit uses account rates), TASK-201 (room-by-room save is atomic).
