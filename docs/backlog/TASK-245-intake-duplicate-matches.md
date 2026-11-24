# TASK-245: One intake form that finds who and where you already have

Status:
Proposed

Epic:
EPIC-006 Role-Based Workspaces

Phase:
cross-cutting

Severity:
Medium. Duplicate customers and properties, and realtor-paid work set up by hand.

Problem:
The prototype's New request dialog takes who called, who the work is for, who pays and
the address in one form. As you type a name, phone or street it shows "Use this" matches
for existing people and properties. The app's intake (`/app/intake/new`, UX direction
section 8) does not show matches while typing, and realtor-paid work needed special
handling (TASK-158/159).

Scope:
- One dialog from the New button: caller, "the work is for someone else" toggle, client,
  address, what they asked for, source.
- Live matches on phone (last 10 digits), email, name and normalized street; "Use this"
  fills the field from the existing record.
- Who pays defaults to the client; can be set to the caller (realtor, property manager)
  using the TASK-158 sponsor fields.
- Creates the request (or job) through the existing intake API.

Out of scope:
- Merging existing duplicates.
- Conversational / AI intake.

Acceptance Criteria:
- [ ] Typing a known phone number offers that person before the form is saved.
- [ ] Typing a known street offers that property.
- [ ] A realtor calling for a seller creates one request with the seller as client and the realtor as payer.
- [ ] No duplicate person or property is created when a match was offered and used.

Test Plan:
- Unit: phone and street normalizers match the forms already in the database.
- E2E: intake with an existing phone and address; one request, no new client or property.
- Side-by-side check against the prototype intake dialog.

Related:
UX direction sections 8, 32. TASK-158, TASK-159, TASK-236.
