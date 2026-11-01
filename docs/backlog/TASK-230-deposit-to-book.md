# TASK-230: Quotes ask for the standard deposit to book

Status:
In Progress

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
Owner, 2026-10-31: "there is no mention of 30 percent down to book on the
estimates." Prepare Quote created quotes with no deposit, so the customer
page, PDF and print view showed no deposit row (all three hide it at $0). The
account's custom estimate terms said only "A materials deposit may be required
before work is placed on the schedule." The new-quote form already started at
the standard deposit; Prepare Quote did not.

Scope:
- Prepare Quote quotes start with the account's standard deposit (Settings →
  Company "Standard deposit (%)", default 30%), due before scheduling
  (`standardDepositFields` in `lib/estimates/deposit-policy.ts`).
- The customer page, PDF and print view label the deposit row "Deposit to book
  (30%)" (`depositLabel` in `lib/estimates/customer-quote.ts`).
- Data, applied 2026-10-31 on production at the owner's request (not code):
  - EST-2026-0026 (Dowd): deposit 30% = $2,625, balance $6,125.
    Reversal: `UPDATE estimates SET deposit_required=false, deposit_type='none',
    deposit_percentage=NULL, deposit_cents=0, balance_cents=total_cents WHERE
    id='389f504f-0fc1-4c85-9623-750b4a7d15fb';`
  - Dovetails Home Services estimate terms, Deposits paragraph: "A materials
    deposit may be required before work is placed on the schedule." became "A
    {deposit_percent} deposit is required to book your project. Deposits are
    applied toward the final invoice." `deposit_terms` set to "" so the PDF does
    not print a second Deposits section. Reversal: replace the sentence back and
    remove the `deposit_terms` key from `accounts.settings`.

Out of Scope:
- Showing the full terms on the customer portal page (it shows none today).
- The deposit row on staff screens keeps its "Deposit due" label.

Acceptance Criteria:
- [ ] A quote from Prepare Quote has the standard deposit percentage set.
- [ ] The customer page, PDF and print view show "Deposit to book (30%)".
- [x] The Dowd quote shows a $2,625 deposit (data, 2026-10-31).

Effort:
0.5 day.
