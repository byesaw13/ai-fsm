# TASK-201: Room-by-room engine path is atomic and keeps adjustments

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
Medium, latent.

Problem:
`apps/web/lib/estimates/compute.ts` (`computeAndPersist`) runs after the create
transaction with separate queries; a failure is only logged and leaves the
estimate with its pre-engine totals. On success it overwrites the total with
an engine total that excludes travel and risk, leaves tax_cents stale and does
not reset the pricing review.

Scope:
- Run inside the create transaction on the same client; a failure fails the
  create.
- Total includes travel and risk; tax recomputed; pricing review re-run.

Acceptance Criteria:
- [ ] A forced engine error leaves no estimate row.
- [ ] An engine estimate with a $75 travel surcharge totals engine + $75.
