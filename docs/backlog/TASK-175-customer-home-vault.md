# TASK-175: Customer Home Vault — category view and capture from Job Reports

Status: In progress
Phase: 2
Epic: EPIC-003 Property Intelligence

Problem:
The marketing site's Home Vault promises six categories (mechanical systems,
appliances, filters, paint and finishes, monitor items, vendors). The app can
store all six, but customers only see a flat "Equipment on File" list without
location or notes, and staff have no path to record these details except the
manual property-page form. Production holds zero vault items (2026-10-06).

Business Value:
The vault is the thing Nick shows new customers. What the site shows must be
what a customer actually gets, and filling it should come out of work already
being done (the Job Report), not a separate inventory chore.

Owner decision 2026-10-06: build the vault out to match the site. This
amends the Phase 2 Customer Home Record exception in `ROADMAP.md`.

Scope:
- Portal property page shows "Your Home Vault": the six categories in site
  order with the site's descriptions, completeness meter, and per item:
  name, location, make · model, installed / serviced / next service, notes.
  Monitor items carry a Watch flag. Empty categories are listed as "not yet
  recorded" so the record reads honestly.
- Job Report editor: each "Keep for your records" line can also be saved to
  the house's vault under a category. Publishing creates the vault item once
  (re-publishing does not duplicate). Sponsored reports never write to the vault.
- Staff vault notes are labelled as customer-visible.
- No schema change; existing `property_vault_items` columns only.

Acceptance Criteria:
- [ ] A property with items in all six categories shows six cards in the portal, each item with its recorded fields.
- [ ] A property with no items shows the categories as not yet recorded, not a blank page.
- [ ] Publishing a report with two vault-tagged records creates two items; publishing again creates none.
- [ ] A sponsored (realtor-paid) report creates no vault items.
- [ ] Unit tests cover grouping and record → vault mapping.

Depends on: TASK-162, TASK-168.

Validation (2026-10-06):
- Unit: `groupVaultForCustomer` (domain), `cleanRecords` vault tag + `vaultItemsFromRecords` (web).
- Integration: `job-reports.integration.test.ts` — two tagged lines add two items linked to the job's visit; republish adds none; a realtor-paid report adds none.
- Browser (dev DB, all six categories): portal property page at 1280px and 390px, no horizontal scroll.
- Also fixed: install/service dates showed one day early (date-only values parsed as UTC midnight).
