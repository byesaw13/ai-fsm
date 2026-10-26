# TASK-198: Keep the deposit rule when it works out to $0 at create

Status:
Proposed

Epic:
EPIC-004 Billing & Profitability

Phase:
3

Severity:
Medium.

Problem:
`apps/web/lib/estimates/create-estimate.ts` stores the calculated deposit
(`depositPolicy.deposit_required/deposit_type`), and
`calculateDepositPolicy` (`apps/web/lib/estimates/deposit-policy.ts:44`)
returns "none" when the amount is 0. A materials deposit chosen before any
materials lines exist (Prepare Quote, then Apply) is saved as "none", and later
edits never produce a deposit.

Scope:
- Store the owner's rule (required, type, percentage, fixed) as entered; store
  the calculated deposit_cents separately; every recalculation uses the rule.

Acceptance Criteria:
- [ ] Create with a materials deposit and no materials lines, then add a $500
      materials line: deposit_cents becomes 50000.
- [ ] Existing estimates keep their deposits.
