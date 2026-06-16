# TASK-006: Assessment → Materials Generator Context

Status:
Done

Problem:
The materials generator did not carry full assessment context, so generated
material lists could miss or misread what was found on site.

Business Value:
Material lists that reflect the actual assessment reduce re-work, wrong orders,
and supplier trips.

Scope:
- Compose the materials generator job description from the full assessment.
- Preserve assessment context through the materials generation step.

Out of Scope:
- Estimate-side context (TASK-007).

Acceptance Criteria:
- [x] Materials generation uses the full assessment context.
- [x] Context is preserved (not dropped) across the generation step.

Notes:
Shipped in PRs #308 and #311. See `apps/web/lib/estimates/assessment-context.ts`
and its tests.
