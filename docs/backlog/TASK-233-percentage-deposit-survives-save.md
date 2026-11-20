# TASK-233: A percentage deposit survives a quote save

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
High. A plain Save drops the deposit to $0, and the customer page stops asking for it.

Problem:
`estimates.deposit_percentage` is a `numeric` column, so node-pg returns it as text (`"30.00"`).
`updateEstimateById` (`apps/web/lib/estimates/repository.ts`) passes it straight to
`calculateDepositPolicy`, whose `clampNumber` rejects anything that is not a finite number and uses 0.
The deposit becomes $0 and the balance becomes the whole total. Reproduced: 30 gives $2,625 on $8,750;
`"30.00"` gives $0.

Every save through that path recalculates the deposit, so any edit-form Save on a quote with a
percentage deposit clears it. Since TASK-230, every prepared quote starts with a 30% deposit.

Found 2026-11-02 on Angela Dowd (EST-2026-0026): two edit-form saves set the deposit to $0, and her
quote page lost "Deposit to book (30%) $2,625". It was restored by hand the same day. Also at $0 with a
30% deposit: Rochelle Palmacci (EST-2026-0025, draft) and Elliot Lasky (EST-2026-0012, approved).

`add-on-choice.ts` already converts with `Number(...)`. The other readers pass the raw value:
`compute.ts`, the invoice Square-link route and the invoice portal route.

Scope:
- `calculateDepositPolicy` accepts a numeric string and converts it, so every caller of it is safe.
- Check the other readers above and convert where they do arithmetic with the value.
- A guarded data fix recalculates the deposit for drafts and sent quotes whose percentage deposit is $0
  but whose total is above $0. Approved quotes are listed for the owner to decide (EST-2026-0012).

Out of scope:
- Changing the column type.

Acceptance Criteria:
- [ ] An edit-form Save on a quote with a 30% deposit keeps the deposit at 30% of the total.
- [ ] `calculateDepositPolicy` gives the same result for `30` and `"30.00"`.
- [ ] The data fix restores the deposit on affected drafts and sent quotes, and leaves approved ones
      for the owner.

Test Plan:
- Unit test: `calculateDepositPolicy` with a numeric string.
- Integration test: PATCH line items on a 30% deposit quote; `deposit_cents` stays at 30%.

Related:
TASK-230 (standard deposit to book), TASK-232 (edit form keeps job and property).
