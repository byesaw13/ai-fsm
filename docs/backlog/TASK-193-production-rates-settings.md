# TASK-193: Editable production rates with calibration

Status:
In Progress (PR 1 live; PR 2 in review)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-188

Problem:
`production_rates` (21 seeded rows, sq ft or units per hour/day by service
code) and `production_rate_modifiers` exist but nothing says whether a rate was
checked against real jobs. The square-foot painting calculator turns area into
price with $/sq ft constants, not hours. Rate 5012 (interior walls) was set to
400 sq ft/day by the owner on 2026-10-26 (migration 207, #718) and now drives
Prepare Quote wall hours.

Scope:
- Settings (owner/admin): view and edit rates and modifiers; `calibrated` and
  `calibrated_at` per row, default false.
- The square-foot calculator produces hours from rates: quantity / rate
  (per-hour units) or quantity / rate x hours per day (per-day units; an
  editable Settings value, default 8, shown next to each conversion; owner
  decision 2026-10-26), times
  (1 + sum of applied modifier percentages) for prep, tall walls and cutting
  around built-ins. Each line saves the rate id, value, unit, modifiers and
  calibration state.
- Hours from a rate count as calibrated only when the rate and every applied
  modifier are calibrated. Otherwise AI hours stay the default, labeled
  "AI estimate".
- Exception (owner decision 2026-10-26): rate 5012 keeps driving wall hours,
  labeled "production rate (uncalibrated)" until calibrated.

Delivery (split 2026-10-31 by the implementing agent; no product change):
- PR 1: the Settings → Labor & Pricing "Production rates" card. Owner and admin list and edit every rate
  and modifier and mark them calibrated (`calibrated_at` stamped, cleared on uncalibrate). A tech gets
  403. The hours-per-day setting (default 8) is on the pricing form, and every per-day rate shows its
  hourly pace next to it. Prepare Quote's wall and trim pace use the setting instead of a fixed 8.
  `productionRateHours` is in `packages/domain/src/production-rates.ts`.
- PR 2: the square-foot calculator (room-by-room painting editor, `useEstimateForm.ts` painting mode)
  turns area into hours with the rates. It saves `production_rate_snapshot` (rate id, value, unit,
  hours-per-day, modifiers, calibration) on the labor line. Uncalibrated rates leave AI hours as the
  default ("AI estimate"), except 5012 walls ("production rate (uncalibrated)"). That form references
  the `painting.ts` legacy adapter, so doctrine Rule 3 (retire on touch) applies: plan it before
  building.

PR 2 as built (2026-10-31):
- `packages/domain/src/painting-rate-hours.ts` `paintingRateHours(rooms, options, rates, hoursPerDay)`.
  Walls: rate 5012 always (calibrated or not), times the Craftsman wall-height factor (same table
  Prepare Quote uses, approval G7), times coats / 2 (the rate is two coats), slowed by modifiers that
  match room flags: `dark_to_light` (room), `occupied_home` and `vaulted_ceilings` (project). Trim:
  rate 5003 only when it and its applied modifiers are calibrated. Ceilings have no rate, so they and
  uncalibrated trim keep the calculator's old default (0.85 h per 100 sq ft per coat; trim was never
  counted by it). No AI is involved in this calculator, so the default is labeled "estimated", not
  "AI estimate". No prep-level modifier is seeded, so prep does not change hours.
- `useEstimateForm.handleRoomByRoomChange` uses it (rates from GET /api/v1/production-rates via
  `usePaintingRates`; owner/admin, the same roles that can create estimates). The labor line is sent
  with `hours_source: "production_rate"` and `production_rate_snapshot` only while the hours field
  still holds the calculated value; typed-over hours save as the owner's, with no snapshot.
- `create-estimate.ts` accepts `production_rate_snapshot` per line and stores it only next to
  `production_rate` hours. The editor preview shows "Labor hours: N — walls from production rate
  (uncalibrated), 400 sq ft a day = ...; ceilings estimated ..." (`lib/estimates/painting-hours-display.ts`).
- Rule 3: the legacy adapter (`roomSpecsToEstimateSpec`'s "Pricing reconciliation" forcing the engine
  total to the `computePaintingProject` total, plus the editor preview and shopping list reading
  `computePaintingProject`) is NOT retired here: removing it changes customer prices, which needs an
  owner decision. Logged as TASK-229.
- Not changed: `hoursSourceLabel` still prints "production rate (uncalibrated)" for every
  production-rate line on saved quotes; the snapshot's `calibrated` flags hold the truth.

Out of Scope:
Calibrating from actual hours (PI-007, Phase 4).

Acceptance Criteria:
- [x] A tech cannot edit rates; owner and admin can. (PR 1)
- [x] With rate and modifiers uncalibrated, a new calculation uses default hours
      labeled "estimated" (except 5012 walls, labeled uncalibrated). (PR 2)
- [x] Marking a rate and its modifiers calibrated makes new calculations use
      it, labeled "production rate". (PR 2)
- [x] Changing a rate leaves hours on saved quotes unchanged. (PR 2: hours and the rate snapshot are stored on the line)

Effort:
1.5 days.
