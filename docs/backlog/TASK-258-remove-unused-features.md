# TASK-258: Remove three features that were never used

Status:
Done

Epic:
EPIC-005 Platform & Delivery

Phase:
cross-cutting

Severity:
Low. Pages, routes and a daily job that hold no data still have to be kept working.

Decision (owner, 2026-11-25): remove property issue tracking, the monthly close report and intake invite links. Keep vehicle service reminders, Good/Better/Best options and memberships.

Problem:
Production has no rows for any of these (second audit 2026-11-25):
- Property issue tracking (`property_issues`, `property_condition_snapshots`): issue routes under `api/v1/properties/[id]/issues`, `PropertyIssuesPanel.tsx`, `lib/visits/condition-seeding.ts`, the worker's `property-issue-scan.ts` (an automation that runs daily and finds nothing), plus sections of the property, visit and portal pages.
- Monthly close report (`period_closes`; the month CSV export it linked to stays, linked from the Reports page): `app/app/reports/close/*`, `api/v1/reports/period-closes`, `lib/reports/db.ts` parts, its integration test.
- Intake invite links (`intake_invites`): `app/intake/[token]/*`, `api/intake/[token]`, `api/v1/booking-requests/[id]/send-intake`, and the send button on the request page. No invite was ever sent, so no customer holds a link.

Scope:
- Remove the code, the menu and page entries that lead to it, the `property_issue_scan` automation and its registry entry, and the owner map line for `property_issues` in `app/app/map/map-data.ts`. Run `node scripts/map-unlinked.mjs` and list what it reports in the PR.
- Leave the tables in place (no destructive migration). A later task can drop them once nothing has needed them.
- TASK-012 (property health records) stays Deferred; if it is built later, it starts fresh.

Out of scope:
- Vehicle service reminders, Good/Better/Best, memberships and plans (owner: keep).

Acceptance Criteria:
- [x] None of the three features is reachable from any page or menu, and their routes are gone.
- [x] The worker no longer runs a property issue scan.
- [x] Property, visit, request and portal pages still load for real records.
- [x] knip, lint, typecheck and tests pass.

Test Plan:
- E2E: property page, visit page, request page and a portal property page load.
- Read-only production check before merge: the three tables are still empty.

Related:
TASK-012 (Deferred).
