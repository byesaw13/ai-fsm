# TASK-166: Realtor portal — work you paid for, by address, and "bill me" requests

Status:
Proposed

Phase:
2 (extends the TASK-158 narrow sponsored-work exception)

Epic:
EPIC-003 Property Intelligence

Problem:
Realtors such as Kim Tufts and Norman Boyd pay for work at their clients' homes.
The portal shows this as a flat Sponsored Work list. They can't:
- see what they spent at each address;
- print everything for one listing;
- ask for new work and say "bill me".

Business Value:
Realtors bring repeat work. Making it easy for them to order, track and hand
over listing-prep records keeps them sending jobs.
Design: `docs/designs/customer-home-record-job-reports.md` (section 5).

Scope:
- Replace the Sponsored Work list with a "Work you paid for" section:
  - grouped by the invoice's property address;
  - paid and due amounts per address, plus all-time and this-year totals;
  - Select all per address for the combined PDF (TASK-161);
  - links to the published job reports and a sponsor-only home record (TASK-165).
- "Request work for a client's home" form:
  - address, what's needed, access notes, Who pays (bill me / bill homeowner),
    and an optional homeowner name;
  - writes to `booking_requests`, with one additive column
    `bill_to_requester boolean NOT NULL DEFAULT false`;
  - staff invoices from a "bill me" request default to `realtor_sponsored`.
- Scoping is unchanged: the realtor sees only the minimum property identity and
  the invoices billed to them.

Acceptance Criteria:
- [ ] A realtor sees per-address totals only for invoices billed to them.
- [ ] A "bill me" request shows in Requests flagged as realtor-paid, and the
      invoice created from it defaults to sponsored.
- [ ] A realtor cannot see homeowner-paid work at the same address.

Depends on: TASK-161 (print), TASK-162/165 for report and record links.
