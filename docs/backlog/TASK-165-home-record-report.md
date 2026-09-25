# TASK-165: Home Record report (one-page house history)

Status:
Proposed

Phase:
2

Epic:
EPIC-003 Property Intelligence

Problem:
Homeowners selling, insuring or refinancing have no clean record of the work
done on the house. Realtors who pay for listing prep have nothing to hand buyers.

Business Value:
Makes the record worth keeping. It is "Carfax for your house", built from
Dovetails work with no customer data entry. Modelled on the Bodie Report.
Design: `docs/designs/customer-home-record-job-reports.md` (approved 2026-09-24).

Scope:
- One PDF per property (pdf-lib, same branding as invoices) containing:
  - the address;
  - totals by area and by type (improvement/repair/maintenance);
  - each published report: date, title, one after photo, and records items.
- Available from the portal property page (portal session, owner of property)
  and from the staff property page.
- Includes only published reports for that property. Never includes invoices
  or amounts billed to a different client.
- Realtor (sponsor) version: a realtor can download a record for an address
  that includes ONLY the published reports whose invoices they paid. Nothing
  paid by the homeowner or anyone else appears.

Acceptance Criteria:
- [ ] PDF lists only published reports for the property.
- [ ] A client cannot download the record for a property they don't own.
- [ ] Totals match the published reports' linked invoice paid amounts.

Depends on: TASK-162.
