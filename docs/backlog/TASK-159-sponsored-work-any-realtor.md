# TASK-159: Sponsored work for any realtor in one form

Status:
In progress

Phase:
2

Epic:
EPIC-003 Property Intelligence

Problem:
TASK-158 requires a named "work for" contact on every realtor-sponsored
invoice, and the invoice form cannot create a property for sponsored work.
Realtors (Kim Tufts, Norman Boyd, and others) often pay for work where the
client's name is unknown or irrelevant, so billing a new job took three
screens and a placeholder contact.

Business Value:
Any realtor job is one form: pick the realtor as payer, add or pick the
service property (no owner), pick a purpose, add the work. The record still
shows the realtor paid and the property is not theirs.

Scope:
- "Work for" (beneficiary contact) is optional on sponsored invoices; when
  present it must still belong to the selected property.
- Owner/admin can create an ownerless property from the new-invoice form when
  billing context is realtor-sponsored.
- PDF, print, portal, list, and export omit "Work for" when blank.
- Norman Boyd data cleanup (duplicate client merge, 133 Hackett Hill Rd and
  16 E Chamberlain sponsored links, main property 58 Morrill Road) as a guarded
  one-time patch outside application migrations.

Out of Scope:
- Realtor-specific client type or permissions; relationship roles still grant
  no access.

Acceptance Criteria:
- [ ] A sponsored invoice saves with payer, property, and purpose only.
- [ ] A beneficiary from another property is still rejected.
- [ ] Sponsored documents render without a "Work for" line when none is set.
- [ ] The new-invoice form can create an ownerless property for sponsored work.
- [ ] Norman's records are linked without duplicate clients or properties.

Design:
Follow-up to TASK-158 (`docs/superpowers/specs/2026-09-24-realtor-sponsored-property-work-design.md`);
the only rule change is beneficiary optional.
