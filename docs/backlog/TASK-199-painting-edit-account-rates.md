# TASK-199: Painting edit prices lines with the account's rates

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
Medium, latent (no square-foot painting estimates in production yet).

Problem:
`apps/web/app/app/estimates/[id]/EstimateEditForm.tsx` (paintingResult) prices
the labor line with built-in `CURRENT_RULES`, while
`apps/web/lib/estimates/repository.ts` (has_painting_fields branch) computes
the total with the account's rules, so lines and total disagree when rates
differ. The materials and handling lines are sent without `line_item_type`
and are stored as labor.

Scope:
- Server builds the painting lines from the account's rules; the form shows
  the server result.
- Materials and handling lines carry their types.

Acceptance Criteria:
- [ ] With an account rate different from the built-in rate, saved lines sum
      to the saved subtotal.
- [ ] The materials line is stored as materials.

Related:
TASK-193 (calculator moves to hours).
