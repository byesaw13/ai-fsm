# TASK-237: A shorter menu, and Money on one page

Status:
In progress

Epic:
EPIC-006 Role-Based Workspaces

Phase:
cross-cutting

Severity:
Medium. The owner sidebar has about 14 entries. The phone Money tab opens Bills only.

Problem:
`components/AppShell.tsx` `buildHubSections` lists Home (Today/Desk, Capture, Day Review,
Tracking), Work (Requests, Quotes, Jobs, Schedule), People (People, Houses), Money
(Bills, Reports), Settings and Map. Expenses, mileage and materials are only in the
Money hub chips (`lib/navigation/hubs.ts`). The phone Money tab goes to `/app/invoices`.
UX direction section 3 says to reduce the prominence of single modules (Requests,
Quotes, Visits, Materials, Mileage, Expenses, Bills, Reports). Audit: section 31.

Scope:
- Sidebar and the phone More sheet show the same five groups the phone tabs show:
  Today/Desk, Jobs, Customers, Money, More (words from TASK-235).
- Jobs groups Requests, Estimates, Jobs and Schedule as tabs inside one page (the existing
  hub chips), not four sidebar items.
- Customers: a customer page already lists their properties; Properties becomes a tab inside Customers.
- Money: no new route. `/app/invoices` becomes the Money page: three summary cards at
  the top, then the invoice list. Its three sections: **Owed to me** (open invoices), **I spent**
  (expenses, material runs), **Mileage**. Reports link from its header.
- More: Capture, Day Review, Tracking, Reports, Map, Settings. Admin also gets Action
  Queue here (today no link reaches `/app/action-queue`).
- Capture stays one tap away through the New button (TASK-236).

Out of scope:
- Deleting any page or route.
- Tech navigation (already Today only).

Acceptance Criteria:
- [ ] Owner and admin sidebars show at most six entries.
- [ ] The phone Money tab opens a page with owed / spent / mileage, each with totals.
- [ ] Every page reachable before is still reachable within two taps.

Test Plan:
- Unit: `vocabulary.unit.test.ts` and `hubs.unit.test.ts` updated for the new groups.
- E2E: every old sidebar destination is reachable from the new menu.

Build:
Runbook Track E, step E4. Needs E1 and E3 Verified.

Related:
TASK-081 (nested hubs), TASK-236, TASK-238.
