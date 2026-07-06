# Phase 1 — Operations Engine Kickoff

> **For agentic workers:** Execute tasks in order. Phase 0 is complete; scope freeze lifts only for Phase 1 backlog items.

**Goal:** Finish the Operations Engine foundation so payroll, activity, vehicle, and location lifecycles are independent and day close never overloads unrelated concerns.

**Architecture:** `docs/canonical/OPERATIONS.md` is authority. Build on shipped infrastructure (business_days, activity_entries, vehicle_sessions, location_segments). No new EPICs.

**Spec:** `docs/canonical/ROADMAP.md` Phase 1 section

---

## Slice 1: TASK-056 — Current Operations State (finish)

**Status:** Endpoint exists (`GET /api/v1/operations/state`); missing transitions + field wiring.

**Files:**
- `apps/web/lib/operations/state.ts` — add `valid_transitions` derived from current rows
- `apps/web/lib/operations/__tests__/state.unit.test.ts` — new tests
- Optional: `FieldRightNowCard` or `MyDayMobileLayout` — consume ops state instead of duplicate queries (clean on contact)

**Acceptance:**
- [ ] Unit tests cover clocked-out / clocked-in / activity / vehicle combinations
- [ ] API returns `valid_transitions` array documented in `docs/contracts/api-contract.md`
- [ ] `pnpm gate:fast` green

---

## Slice 2: TASK-053 — Activity + Assignment (finish consumers)

**Status:** Done — migration 131 consumers wired; verb/assignment independence tested.

**Files:**
- Audit `activity_entries` writers/readers for `assignment_kind`, `labor_bucket`
- `packages/domain/src/activities.ts` — labor_bucket rules
- Tests for verb + assignment independence

**Acceptance:**
- [x] Switching activity on same assignment does not touch clock
- [x] labor_bucket mapping unit-tested

---

## Slice 3: TASK-054 — Day Close + Reopen (verify gaps)

**Status:** Done — server gate + reopen reason UX; inbox deferred (no `action_items` consumer yet).

**Verify:**
- [x] Checklist gates close (payroll, activities, mileage) — server-enforced on both close paths
- [x] Reopen records reason on `business_days` — `CloseButton` + `BusinessDayBar` prompt for reason
- [x] No second fake close path on My Work / WorkdayPanel — links to Day Review only

**Deferred:** Operational inbox (`action_items`) soft gate — table exists, no field checklist row yet.

---

## Slice 4: TASK-046 — Privacy controls

**Status:** Done — home/private filtered from reports; retention pruning job; settings knob.

**Shipped:**
- `isPrivateLocation()` filters home/private from segments API, day map, day review
- Worker `pruneLocationEvents` deletes stale `location_events` per `location_retention_days`
- Settings exposes retention window (30–90 days)

See `EPIC-007` TASK-046 notes.

---

## Slice 5: TASK-050 — Mileage ↔ travel-time

**Status:** Proposed; migration 130 scope.

Defer until Slices 1–3 boring.

---

## Out of scope (Phase 1)

- EPIC-008 Production Intelligence
- Property surfaces (Phase 2)
- New location capture features (maintain only)
- MCP write tools