# TASK-093: Vehicle & Trailer Cost-of-Ownership

Status:
Done

Phase:
1

> **Scope-freeze gate (ROADMAP):** "No new tables or routes until Phase 0 and
> Phase 1 are boringly reliable." This task adds 6 tables + routes, so do NOT
> start until the Operations Engine core (TASK-051/053/056, Business Day +
> Activity + Current Ops State — all Done) has run a real field day without
> blockers. It extends the Phase 1 vehicle concern from "which vehicle / how
> many miles" to "what each vehicle costs."

Problem:
`vehicles` tracks identity + Bluetooth auto-mileage only. Fuel, oil changes,
maintenance history, financing, and registration/insurance renewals live in the
owner's head, on paper, or in a shoebox. Result: missed maintenance (no reminder
the RAM is due for oil or the trailer registration lapses), no true cost per
vehicle (fuel + maintenance + loan + registration), and a leaky tax picture
(mileage is tracked but vehicle expenses aren't tied to a vehicle).

Business Value:
One capture layer turns into three payoffs — never-miss maintenance reminders,
true cost per vehicle (per month / per mile), and clean year-end vehicle
deductions — all as views over a single money source of truth.

Scope:
Authoritative build spec (data model, decisions, tasks, UX):
`~/.gstack/projects/byesaw13-ai-fsm/nick-main-design-20260806-214114-vehicle-cost-of-ownership.md`.
- Extend `vehicles`: `kind` (truck/van/trailer), `vin`, purchase fields;
  archive-only (`is_active`), block hard-delete with history.
- New tables (composite `(vehicle_id, account_id)` FKs; RLS: capture
  tech-writable, financial facts owner/admin): `vehicle_fuel_logs`,
  `vehicle_service_records` (`service_types text[]`), `vehicle_service_schedules`,
  `vehicle_loans` (reference-only), `vehicle_renewals` + `vehicle_renewal_records`.
- **Money source of truth = `expenses` only:** add `expenses.vehicle_id`
  (`ON DELETE RESTRICT`); every fuel/service/renewal/loan-payment event
  auto-creates exactly ONE expense **in the same transaction** (records carry
  no cost column). Cost + tax become one query.
- Odometer: soft-flag `odometer_suspect` (never block); MPG/next-due exclude
  suspect rows.
- Reminders: new `services/worker/src/vehicle-maintenance-reminder.ts` computes
  next-due from schedules/renewals → `attention_events` with stable `dedupe_key`.
- Projections: `vehicle_cost_summary` view, MPG (full-tank deltas w/ partials),
  tax export grouped by vehicle.
- UI (reuse `HubSubnav`/`MetricGrid`/`DataTable`/`EmptyState`/`Skeleton` +
  `SitePresenceCard` field-card): vehicle Overview + tabs; field quick-add for
  fuel/service reachable from a global "＋ Log" action AND the vehicle tabs;
  trailers hide Fuel/MPG.
- Additive, reversible migrations (start at 168).

Out of Scope:
- Generic asset lifecycle (tools/equipment/property systems) — future EPIC.
- `expense_line_items.vehicle_id` (splitting one receipt across vehicles).
- Cost-trend charts, receipt photos on fuel/service, true offline sync,
  custom per-vehicle reminder-threshold UI, loan interest amortization.

Acceptance Criteria:
- [ ] One real vehicle (RAM) fully represented — identity, loan, registration
      renewal, last oil change, last 3 fuel fills — with zero data in a "notes"
      dumping ground.
- [ ] Closing a fuel/service entry writes record + expense atomically; killing
      the expense insert rolls back the record (integration test — the P1
      failure mode).
- [ ] Overview shows next-due maintenance + next renewal from schedules/renewals;
      reminders fire once per due window (dedupe_key), re-fire after completion.
- [ ] `vehicle_cost_summary` returns monthly + per-mile per vehicle; MPG from
      full-tank deltas excluding suspect rows.
- [ ] Year-end export groups every vehicle expense under its vehicle, retaining
      tax category.
- [ ] A trailer (no fuel/mileage) works cleanly through the same screens.
- [ ] Unit (mpg/next-due) + integration (atomicity, worker dedupe) tests pass.

Testing Plan:
| Layer | What | Count |
|-------|------|-------|
| Unit | `mpg.ts`, `next-due.ts` (partials, miles/months min, suspect-excluded) | +6 |
| Integration | record+expense atomicity; worker reminder dedupe; loan-payment dedupe | +3 |
| E2E | field log-fuel flow; log-service multi-type; trailer excluded from mileage | +3 |

Files Reference:
| File | Change |
|------|--------|
| `db/migrations/168+` | extend vehicles + expenses.vehicle_id + 6 tables + RLS |
| `apps/web/app/api/v1/vehicles*`, `.../expenses` | capture endpoints (atomic expense) |
| `apps/web/lib/vehicles/{mpg,next-due}.ts` | pure calculators |
| `services/worker/src/vehicle-maintenance-reminder.ts` | reminders + loan-payment expense |
| `apps/web/app/app/mileage/vehicles/*` | Overview + tabs + field quick-add |
| `apps/web/lib/reports/*` | `vehicle_cost_summary` + tax export grouping |

Rollback:
Additive/reversible migrations; drop new tables + `expenses.vehicle_id` +
trigger/worker job to revert. No destructive changes to existing tables.

Notes:
Fully reviewed 2026-08-06 (office-hours → plan-eng-review clean → plan-design-review
9/10). Codex outside voice surfaced and resolved: loan-in-rollup, multi-type
service visit, renewal history split, bundled-expense limit, delete-attribution,
same-account integrity. Large task — split into slices (schema → capture →
reminders → rollups → UI) if the build proves large.

Shipped:
PR #584 (2026-08-07) — migration 170, fuel/service/renewal capture + expense,
schedules/loans APIs, overview + cost-summary, vehicle tax CSV export, MPG/next-due
domain calculators, worker maintenance/renewal reminders + monthly loan payment
expenses, vehicle detail UI (trailer hides fuel). Deployed main → garonhome.

Residuals (not blocking Done):
- No DB-backed integration test for atomicity (unit mocks cover expense-then-record order).
- No E2E for field log-fuel/service.
- RAM seed data is operational entry, not migration seed.
- Global FAB "＋ Log" for fuel/service not wired (tabs on vehicle detail cover capture).

