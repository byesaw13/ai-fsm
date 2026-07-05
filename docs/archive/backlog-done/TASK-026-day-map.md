# TASK-026: Day Map (stops + drive routes)

Status:
Done

Phase:
1

Problem:
The captured day is a list. Stops and drives carry GPS, but the owner can't see
*where* they were — which makes labeling slower and gives no visual check on the
auto-mileage.

Approach:
A map on the activity timeline (`/app/timeline`) that plots the day:
- **stops as pins**, **drives as routes** drawn from the `location_events` GPS
  breadcrumb (denser thanks to the drive-GPS-point automation).
- Provisional vs confirmed are color-coded; popups show the place / trip miles.
- Tiles: **Leaflet + OpenStreetMap** — free, no API key (aligns with the cost /
  complexity policy). Loaded client-side only (`ssr: false`).

Scope:
- `GET /api/v1/activities/segments/geometry[?date=]` — stop pins + drive routes
  for a day.
- `DayMap` (imperative Leaflet client component) + `DayMapPanel` (dynamic, ssr
  off) mounted on the timeline above the Captured Locations panel.
- `leaflet` + `@types/leaflet` dependency.

Out of Scope:
- Geocoding client/property addresses onto the map (separate, needs geocoding).
- Live "where am I now" tracking; offline tiles.

Acceptance Criteria:
- [x] The timeline shows a map of the selected day's stops + drive routes.
- [x] Provisional/confirmed are visually distinguishable; popups identify each.
- [x] Empty days show a clear "nothing mapped yet" state.
- [x] No API key / external billing (OSM tiles).

Notes:
Archived during north-star reconciliation (2026-07-03). Shipped in
`apps/web/app/app/DayMap.tsx`, `DayMapPanel.tsx`, and
`apps/web/app/api/v1/activities/segments/geometry/route.ts`.