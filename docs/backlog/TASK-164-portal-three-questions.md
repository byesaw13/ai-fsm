# TASK-164: Portal answers what we did, what's in your home, what's next

Status:
Proposed

Phase:
2

Epic:
EPIC-003 Property Intelligence

Problem:
The portal leads with invoices; customers want proof of work, what was
installed, and what's coming.

Business Value:
The portal becomes the house's service history. Design: `docs/designs/customer-home-record-job-reports.md` (approved 2026-09-24).

Scope:
- Order: balance-due banner + Request service → latest Job Report → What's next
  (estimates show job title/address, not just date+amount; next visit) → All
  reports → Keep for your records → Invoices (select & print, lifetime spend) →
  Your info.
- "Keep for your records" covers only owned properties (`properties.client_id` or an
  owner-role `property_contacts` row), never sponsored ones.

- Property page = home record (Dovetails work only): timeline of published
  reports, spend by area, improvement/repair/maintenance totals, Download
  home record (TASK-165).

- Several addresses: chip switcher at top; home record / request / what's
  next follow the chosen address. Invoices grouped by address
  (`invoices.property_id` → job's property → "No address yet"), each group
  with paid total, due, and Select all for the combined PDF.

Acceptance Criteria:
- [ ] A two-property client sees invoices split correctly by address.
- [ ] Realtor portal shows no installed items from sponsored properties.
- [ ] Empty states read well for a client with no published reports.

Depends on: TASK-161, TASK-162.
