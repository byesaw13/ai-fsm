# TASK-225: Customer picks add-on options when approving a quote

Status:
In Progress

Epic:
EPIC-002 Estimating & Assessments

Phase:
3 (ROADMAP Phase 3 slice "customer quote presentation and letterhead", owner 2026-10-31)

Depends on:
TASK-224 (options have a price and show on customer views).

Problem:
After TASK-224, a customer sees priced add-ons ("Foyer stairwell +$1,050") but can only approve or
decline the whole quote. To add an option, the owner has to edit the quote by hand after a call or text.
The approved total, the job and the invoice then disagree with what the customer saw.

Scope:
- The portal approval form lists the priced add-ons as checkboxes, all unchecked. The total shown updates
  as the customer ticks them.
- Approve records the chosen option ids and the approved total on the estimate:
  - one nullable jsonb column, `approved_add_ons` (id, label, price_cents)
  - the stored total stays the base price
  - this needs a migration. Table-freeze exception approved by the owner 2026-10-31 (runbook G6).
- The quote's own lines and totals stay as sent. The immutability trigger forbids changing a sent
  quote's totals (found while building, 2026-10-31). Instead:
  - the deposit is recalculated on base + add-ons when the customer approves
  - convert adds one "<label> (added option)" line per add-on to the final bill, and the bill's
    subtotal/total include them (`addOnLines`, `invoiceMoneyFor.add_on_cents` in
    `lib/estimates/approved-lines.ts`)
- Only the first portal approval of a sent quote records add-ons. The owner's transition and the email
  respond path don't offer add-ons.
- The staff estimate page shows which add-ons were chosen.

Out of scope:
- Multi-option packages (`presentation_mode = multi_option`, TASK-200). That is a different feature: pick
  one whole package.

Acceptance Criteria:
- [ ] Approving with one add-on ticked records it, and the approved quote total includes it. Integration
      test.
- [ ] Approving with none ticked behaves exactly as today.
- [ ] Convert to job carries the add-on line.

Open questions for the owner (ask before build):
- Should an add-on chosen after approval (by text) go through a change order instead?

Effort:
1 d
