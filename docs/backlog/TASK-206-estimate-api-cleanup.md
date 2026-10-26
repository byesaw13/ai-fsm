# TASK-206: Estimate API cleanup and stale sent estimates

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
Low.

Problem:
- `apps/web/app/api/v1/estimates/[id]/travel/route.ts` blocks only approved
  estimates; on sent, declined or expired ones the database trigger rejects the
  change and the owner sees a 500.
- PATCH (`repository.ts`) treats a missing tax_rate as 0, so any recalculating
  save wipes tax.
- 12 estimates are still "sent" with no expiry date (some from 2025) and will
  never expire.

Scope:
- Travel route: 409 with a plain message for any status but draft.
- PATCH keeps the existing tax rate when none is sent.
- List the 12 stale estimates for the owner; expire or decline each only with
  the owner's per-estimate OK.

Acceptance Criteria:
- [ ] Travel on a sent estimate returns 409, not 500.
- [ ] Saving lines without tax_rate keeps an existing 6.25% tax.
- [ ] The owner has reviewed the 12 stale estimates.
