# TASK-007: Assessment → Estimate Context

Status:
Done

Problem:
Assessment findings (conditions, scope, measurements) should flow into the
estimate so the estimator is not re-entering what was already captured on site.

Business Value:
Less double-entry, fewer transcription errors, and estimates that reflect the
actual site condition.

Scope:
- Carry assessment context into estimate entry and prefill where it is reliable.
- Consume-and-clear context so stale assessment data is not reused on a later
  estimate.

Out of Scope:
- Full room-by-room template system (TASK-008).
- Estimate versioning (TASK-009).

Acceptance Criteria:
- [x] Assessment context populates the estimate draft.
- [x] Context is cleared after use so it cannot leak into an unrelated estimate.

Notes:
Shipped. The hand-off carries the generated job description and room
measurements from the assessment into the estimate page's materials generator
via `apps/web/lib/estimates/assessment-context.ts` (sessionStorage, no new
tables). `AssessmentForm` writes the context and navigates with
`from_assessment=1`; `useEstimateForm` consumes it once at mount.

Closeout work (this task): consumption is now gated through
`consumeAssessmentContext`, which **always** clears storage but only returns the
context when `from_assessment=1`. This fixes the leak path where context written
by an abandoned hand-off (target form never mounted) would be inherited by the
next, unrelated estimate. Covered by unit tests in
`apps/web/lib/estimates/__tests__/assessment-context.unit.test.ts` (gating +
real-storage round-trip).
