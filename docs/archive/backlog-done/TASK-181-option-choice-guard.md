# TASK-181: Record the customer's chosen option on approval

Status:
Done as a guard (2026-10-24); full wiring deferred to TASK-183

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
Multi-option estimates (`estimate_options`, migration 020) show Good/Better/
Best, but no approval route records a choice. The portal accepts only a name
and an optional signature; the email and SMS routes carry no option. The
deposit comes from one estimate-level `deposit_cents` regardless of choice.

Business Value:
The job, the deposit and the final bill follow what the customer actually
picked.

Scope:
- A multi-option estimate can only be approved in the portal, where the
  customer chooses one option (the recommended one pre-selected). Email and
  SMS approval of a multi-option estimate reply with the portal link. No
  route guesses an option.
- Save the chosen option on the estimate. Only its work flows to the job,
  materials and final invoice.
- Recalculate the deposit from the chosen option with the existing
  `calculateDepositPolicy` rules: percentage of that option's total; materials
  from that option's materials; fixed stays fixed, capped at that option's
  total.
- Single-option estimates approve exactly as today on every route.

Out of Scope:
- Requiring a signature on every route. Today the portal collects one but the
  server accepts approval without it; that stays as is until decided
  separately.

Acceptance Criteria:
- [ ] Approving Better saves Better; the job and final invoice contain only
      Better's work.
- [ ] Percentage, materials and fixed deposits each follow the chosen option.
- [ ] A multi-option estimate cannot be approved without a choice, and email
      or SMS approval of one sends the customer to the portal.
- [ ] Single-option estimates behave as today.

Notes:
Must ship before TASK-182.

Owner decision 2026-10-24: production has no Good/Better/Best estimates, so
ship the guard now and defer the downstream wiring (TASK-183).
Shipped (guard): migration 205 adds estimates.selected_option_id. The portal
requires a pick to approve a multi-option estimate (recommended pre-selected);
the email link redirects multi-option approvals to the portal; the owner's
Mark as Approved needs the option the customer chose. recordOptionChoice saves
the pick and sets deposit and balance from that option with the estimate's own
deposit rule. Creating a multi-option estimate now keeps the deposit rule as
entered (it was being reset to none because the total is 0 before a pick).
Not done here (TASK-183): estimate totals, job, final invoice, work orders and
buy list following the pick. The estimate immutability trigger forbids changing
totals once sent, so that needs a deliberate trigger change.
Acceptance as built:
- [x] A multi-option estimate cannot be approved without a choice; email
      approval sends the customer to the portal.
- [x] Percentage, materials and fixed deposits follow the chosen option.
- [x] Single-option estimates behave as today.
- [ ] Job and final invoice contain only the chosen option's work (TASK-183).

