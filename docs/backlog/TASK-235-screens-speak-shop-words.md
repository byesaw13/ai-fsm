# TASK-235: Customer, Property, Estimate, Invoice on every screen

Status:
Done (2026-11-23, #756, verified on production)

Epic:
EPIC-006 Role-Based Workspaces

Phase:
cross-cutting

Severity:
Medium. The menu says Person, House, Quote and Bill, and the screens it opens say
Client, Customer, Property, Estimate and Invoice. A non-technical user reads these as
different things.

Decision (owner, 2026-11-22):
The staff and customer screens use **Customer, Property, Estimate, Invoice**. This
replaces the September 2026 choice of Person, House, Quote, Bill (#662, #663, #668).
Reasons:
- These words already appear on about 620 screen labels; the September words reach about 70.
- They match the database, the API and Square, so customers see the same word in
  the portal, the PDF and the Square payment page.
- "Person" is vague (a realtor or vendor is a person too). "House" misses condos and
  rentals. "Bill" reads as money the shop owes, and expenses are the shop's bills.
- "Home" was ruled out for properties because the menu and the home screen already use "Home".
`docs/canonical/DOMAIN_MODEL.md` records the decision.

Problem:
Audit 2026-11-22 (`docs/working/ux-implementation-direction.md` section 31), counted
in visible `.tsx` text and labels:

| Thing | Old words on screen | September words on screen |
|---|---|---|
| Customer | Client 161, Customer 71 | Person/People 11 |
| Property | Property 103 | House 17 |
| Estimate | Estimate 177 | Quote 23 |
| Invoice | Invoice 111 | Bill 19 |

`lib/vocabulary.ts` holds the words but only 4 files use it, so labels are typed by
hand and drift. Staff screens also split one thing between "Client" and "Customer".

Scope:
- `lib/vocabulary.ts`: `customer`/`customers`, `property`/`properties`,
  `estimate`/`estimates`, `invoice`/`invoices`; keep `job`, `today`, `desk`.
  Remove `person`, `people`, `house`, `houses`, `quote`, `quotes`, `bill`, `bills`.
- Menus, phone tabs, hub chips, command palette, quick actions: People → Customers,
  Houses → Properties, Quotes → Estimates, Bills → Invoices. The Money tab keeps its name.
- Screen text: every "Client", "Person/People", "House", "Quote" and "Bill" label
  becomes the decided word. Labels use `UI.*` from `lib/vocabulary.ts`, not typed text.
- Customer-facing pages (portal, estimate respond, print, PDF, emails, texts) get the same pass.
- The owner map labels in `app/app/map/map-data.ts` and the bubble names in
  `docs/working/system-map.md` move to the same words in this change.
- Add a unit test that scans `.tsx` text and label props under `app/` and `components/`
  and fails on Client, Person, People, House, Houses, Quote, Quotes, Bill, Bills,
  with an allow-list for real exceptions (e.g. "Preferred client" if kept, "billing").
- Update `lib/__tests__/vocabulary.unit.test.ts` for the new words.

Out of scope:
- Renaming routes, tables, types, API fields or status values. `/app/clients` and
  the `clients` table stay. Only text people read changes.
- Old links: `/app/clients` etc. keep working.
- Internal nouns that also reach screens (Work Order, Assessment, Request, Day Review,
  Tracking). That is a separate pass, after this one.

Acceptance Criteria:
- [ ] No staff or customer screen shows Client, Person, People, House, Quote or Bill outside the allow-list.
- [ ] Menu and tabs read Today/Desk, Jobs, Customers, Money; hubs list Estimates, Invoices, Properties.
- [ ] The scan test runs in `pnpm test:unit` and fails on a reintroduced word.
- [ ] Portal, printed estimate and printed invoice use the same words as the staff screens.

Test Plan:
- Unit: vocabulary scan test (new); `vocabulary.unit.test.ts`, `hubs.unit.test.ts`,
  `quick-actions.unit.test.ts` updated.
- E2E: smoke tests that look for "Quotes"/"Bills"/"People" labels updated.
- Manual: open customer, property, job, estimate and invoice pages plus the portal;
  every label matches the menu.

Build:
Runbook Track E, step E1, in two PRs. PR 1: `lib/vocabulary.ts`, menus, staff
screens, and the scan test. PR 2: customer-facing pages (portal, print, PDF, emails,
texts), plus the scan test switched to cover them. The builder decides the allow-list and
lists it in the PR. A word that is ambiguous in context ("billing address") stays.

Related:
TASK-173 (UX direction on working screens), TASK-081 (nested hubs), TASK-237 (menu).
