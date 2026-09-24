# TASK-158: Realtor-sponsored property work

Status:
Proposed

Phase:
2

Epic:
EPIC-003 Property Intelligence

Problem:
A realtor can pay Dovetails for work at a client's property. Today a property
must belong to one AI-FSM client, and an invoice does not distinguish the payer
from the person who benefited from the work. Assigning the property to the
realtor exposes too much property history; duplicating the property creates two
sources of truth.

Business Value:
Keep one durable property record, show the realtor only the work they paid for,
and produce clear bookkeeping records grouped by property, beneficiary, and
realtor-sponsored purpose.

Scope:
- Allow `properties.client_id` to be null; when present it means primary service
  contact, not legal ownership.
- Add property contacts for registered people or lightweight external names,
  with roles such as realtor, beneficiary, manager, tenant, and other.
- Add a client's explicit main property.
- Keep `invoices.client_id` as payer/bill-to; add sponsored-work category,
  purpose, beneficiary contact, and business-purpose note.
- Allow an invoice payer to select a property whose primary contact is someone
  else or is unset.
- Add a payer-only sponsored-work portal view and descriptive PDF fields.
- Backfill Kim Tufts's known property and invoice relationships.

Out of Scope:
- Realtor access to a property's vault, photos, estimates, jobs, or invoices
  they did not pay.
- A realtor marketplace, referral routing, commissions, tax advice, or client
  portals for lightweight contacts.
- Duplicate property cards per payer.

Acceptance Criteria:
- [ ] One property can have a primary service contact plus realtor/external
      contacts without duplicating the property.
- [ ] A property can exist without a primary service contact.
- [ ] A client can have one explicit main property.
- [ ] A sponsored invoice identifies payer, property, beneficiary, category,
      business purpose, work summary, total, and paid date.
- [ ] A realtor relationship alone grants no portal access.
- [ ] A payer sees only sponsored invoices billed to them and a restricted
      property label/address; no unrelated property data is returned.
- [ ] A primary property contact does not see another payer's invoice or
      payment data through the customer portal.
- [ ] Kim's historical records are linked without duplicate clients,
      properties, invoices, or PDFs.
- [ ] Automated authorization tests cover both allowed and denied cases.

Design:
`docs/superpowers/specs/2026-09-24-realtor-sponsored-property-work-design.md`
