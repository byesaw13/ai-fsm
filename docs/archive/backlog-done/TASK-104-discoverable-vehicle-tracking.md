# TASK-104: Discoverable vehicle tracking

Status:
Done

Phase:
1

Problem:
GPS vehicle tracking (stops, drives, day map) lives at `/app/timeline`, titled
"Activity Timeline". Mileage and the vehicle roster live at `/app/mileage`.
Neither is in the sidebar, the More sheet, or the Money hub. The only persistent
link is a small "Activity Timeline →" in the Reports header. TASK-038 buried
the timeline on purpose; in daily use the owner cannot find vehicle tracking.

Business Value:
The owner can open today's GPS tracking and the mileage/vehicle log from the
same places they already look — Home nav, Money chips, My Day, Day Review —
without memorizing a hidden URL.

Scope:
- Add a Home-hub **Tracking** nav item to `/app/timeline` (owner/admin; not tech).
- Relabel the timeline page to **Vehicle tracking**.
- Add **Mileage** to the Money hub chips so `/app/mileage` (and Vehicles) is
  reachable the same way Expenses and Materials already are.
- Add obvious links from My Day (location capture), Day Review, Overview
  mileage card, Settings tools, and the mileage/tracking page headers.
- Keep `/app/timeline` owner/admin-only. Do not add it back to field quick
  actions (those stay field-work shortcuts).

Out of Scope:
- New tracking backend, map, or ingest changes.
- A new route (reuse `/app/timeline` and `/app/mileage`).
- Changing tech nav.

Acceptance Criteria:
- [x] Owner/admin sidebar and More sheet list Tracking under Home.
- [x] Tracking opens `/app/timeline` and the page title says Vehicle tracking.
- [x] Money hub chips include Mileage.
- [x] My Day and Day Review have a one-tap path to Tracking.
- [x] Techs still do not see Tracking or the account-wide timeline.

Notes:
Reverses the TASK-038 "timeline lives only under Reports" decision for
discoverability. Reports can keep a link; it is no longer the only door.

Shipped: PR #599 (2026-08-15). Truth-pass archive 2026-08-17.
