# TASK-195: Rewrite the estimate review around the baseline

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-188

Problem:
`apps/web/app/api/v1/estimates/[id]/review/route.ts` sends the model 12 fields
and a line count; the prompt in `apps/web/lib/estimates/review.ts` assumes every
job is a $/sq ft painting job and hard-codes $85/h as internal cost. On
Fixture A it asked for square footage and reported $0 materials.
`EstimateReviewPanel` auto-loads, so every estimate page view makes an Opus
call, including on sent and approved estimates.

Scope:
- Input: the baseline result, every line (type, description, quantity, price,
  hours, source), billing method, prepared-scope gaps (groups whose confirmed
  tasks have hours but no materials price, unconfirmed tasks, open questions),
  and rates from Settings. Remove the $/sq ft rules.
- Run on a button only. Store the result in `review_result` with
  `review_for_updated_at`; show the stored result while it matches
  `estimates.updated_at`, else "Re-check".
- Validate the tool output against a schema; treat a cut-off response as an
  error.

Acceptance Criteria:
- [ ] Opening any estimate page makes no AI call.
- [ ] On Fixture A the review names Pantry, Kitchen, Hall and Foyer as
      having hours but no materials price and does not mention square footage.
- [ ] A second open after no edits shows the stored result with no AI call.

Effort:
1 day.
