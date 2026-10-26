# TASK-193: Editable production rates with calibration

Status:
Proposed

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
  (per-hour units) or quantity / rate x 8 (per-day units), times
  (1 + sum of applied modifier percentages) for prep, tall walls and cutting
  around built-ins. Each line saves the rate id, value, unit, modifiers and
  calibration state.
- Hours from a rate count as calibrated only when the rate and every applied
  modifier are calibrated. Otherwise AI hours stay the default, labeled
  "AI estimate".
- Exception (owner decision 2026-10-26): rate 5012 keeps driving wall hours,
  labeled "production rate (uncalibrated)" until calibrated.

Out of Scope:
Calibrating from actual hours (PI-007, Phase 4).

Acceptance Criteria:
- [ ] A tech cannot edit rates; owner and admin can.
- [ ] With rate and modifiers uncalibrated, a new calculation uses AI hours
      labeled "AI estimate" (except 5012 walls, labeled uncalibrated).
- [ ] Marking a rate and its modifiers calibrated makes new calculations use
      it, labeled "production rate".
- [ ] Changing a rate leaves hours on saved quotes unchanged.

Effort:
1.5 days.
