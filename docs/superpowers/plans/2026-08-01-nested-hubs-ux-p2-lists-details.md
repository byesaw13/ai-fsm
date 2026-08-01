# Nested Hubs UX P2 — Lists + Nested Details

**Goal:** T1 hub list chrome + T2 breadcrumbs on primary entity details.

## Shipped

- `lib/navigation/hubs.ts` — Work / People / Money link sets + active helpers
- `HubSubnav` chip row on Work lists (requests, estimates, jobs, work-orders, schedule, visits for admin) and People lists (clients, properties)
- Breadcrumbs on client, property, visit (role-safe for tech), estimate detail
- Job breadcrumbs already shipped in P0

## Out of scope

- Money hub chips (P3)
- Full T1 redesign of table/board density
- What-next rewrites on every detail page (job already has ProjectWhatNext)
