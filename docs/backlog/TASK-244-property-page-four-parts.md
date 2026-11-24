# TASK-244: The property page in four parts

Status:
Proposed

Epic:
EPIC-006 Role-Based Workspaces

Phase:
cross-cutting

Severity:
Medium. The property page is the center of the product and its most crowded screen.

Problem:
`/app/properties/[id]` stacks about nine cards with equal weight: What's next, Open work,
Recent history, History timeline, Property health, Vault, Contacts, Property details and
an edit panel. The prototype shows four parts and puts the rest one tap away (UX
direction sections 20 and 32).

Scope:
- Header: address, town, Map link, Edit, **New request here**.
- **Jobs at this address**: each with status and amount, newest first.
- **People connected**: owners and anyone on a job there, with their role (client,
  referred by, on-site, tenant).
- **Access & site notes**: lockbox, gate, pets, parking; paint colors, panel, shutoffs.
  Edited in place, saves itself.
- Tabs or "More" for History timeline, Property health, Vault and details. Nothing is removed.
- Access notes also show as a key line on the job page and on visit cards.

Out of scope:
- Changes to the vault, conditions or issues data.
- The customer-facing home record.

Acceptance Criteria:
- [ ] On a phone, the four parts fit before any secondary section.
- [ ] Access notes save without an Edit step and show on that property's jobs and visits.
- [ ] Timeline, health, vault and details are each one tap away.

Test Plan:
- E2E: edit access notes on the property, see them on a job and a visit at that address.
- Side-by-side check against the prototype property page.

Related:
UX direction sections 20, 32. TASK-161 to TASK-175 (customer home record).
