# TASK-200: Multi-option estimates keep correct totals and line types

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
Medium, latent (no multi-option estimates in production).

Problem:
- Create stores total_cents 0 for multi-option estimates and runs the pricing
  review against $0 (`create-estimate.ts`, is_multi_option branch).
- Edit sets subtotal to the first option and total to the most expensive
  option, and drops travel and risk amounts (`repository.ts`, options branch).
- Re-saving options from `EstimateEditForm.tsx` (handleSave) sends only
  description, quantity and price, so every option line becomes visible
  labor and loses its price-book link.

Scope:
- Create and edit store the same total rule (most expensive option, including
  travel and risk) with a matching subtotal; pricing review uses it.
- Option lines keep type, visibility and price-book id through edit.

Acceptance Criteria:
- [ ] A new Good/Better/Best estimate lists at its highest option's total.
- [ ] Saving options twice leaves every line's type unchanged.

Related:
TASK-183.
