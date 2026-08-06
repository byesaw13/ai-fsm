# TASK-081: Nested hubs UX system (Home / Work / People / Money)

Status:
Done

Phase:
cross-cutting (UX shell; phases P0–P4)

Problem:
Navigation is a flat list of destinations. Field and office share one product
but chrome does not express hubs, nesting (Client → Property → Job → Visit), or
minimal-input patterns consistently. A full redesign is needed without a
greenfield rebuild.

Business Value:
- Faster daily navigation (fewer wrong taps to the next action).
- Clearer mental model for owner hybrid (phone field / desktop office).
- Shared templates so every screen can be modernized in phases.

Scope:
- **P0 (this PR):** AppShell nested hub sections; mobile bottom tabs Home/Work/
  People/Money + More; Breadcrumbs + WhatNext primitives; wire breadcrumbs on
  job detail; unit tests.
- **P1–P4:** Home surfaces, People/Work lists and details, Money + guided
  editors, ops boards + polish — per
  `docs/superpowers/specs/2026-08-01-nested-hubs-ux-design.md`.

Out of Scope:
- New domain objects or workflow steps.
- New AI product surface.
- Rewriting every page in a single PR.

Acceptance Criteria:
- [x] P0: labeled hubs in sidebar + More sheet; bottom tabs map to four hubs.
- [x] P0: role/workspace home rules preserved (owner field My Day, admin Overview).
- [x] P0: Breadcrumbs + WhatNext primitives exported; job detail uses breadcrumbs.
- [x] P1: My Day + Overview field-hero / what-needs-you chrome; start-day sheet + arrival confirm.
- [x] P2: Work/People hub subnav on lists; breadcrumbs on client/property/visit/estimate (+ job).
- [x] P3: Money hub chips; invoice/expense breadcrumbs; WhatNext billing queue; T4 new-form guidance.
- [x] P4: schedule toggle + toolbar; settings touch targets; field 44px buttons; materials in Money hub; reduced-motion.

Notes:
Spec: `docs/superpowers/specs/2026-08-01-nested-hubs-ux-design.md`
Plan (P0): `docs/superpowers/plans/2026-08-01-nested-hubs-ux.md`
Shipped P0–P4 via nested hubs PRs (#554–#556 and prior). Archived in backlog
truth pass 2026-08-05.
