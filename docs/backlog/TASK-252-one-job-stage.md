# TASK-252: The job page works out where a job stands once

Status:
Proposed

Epic:
EPIC-006 Role-Based Workspaces

Phase:
cross-cutting

Severity:
Medium. Three calculations of a job's position sit on one page and can disagree.

Problem:
`app/app/jobs/[id]/page.tsx` uses `derivePipelineStage` (`packages/domain/src/stages.ts`), `computeWhatNext` (`ProjectWhatNext.tsx`, about 470 lines, the next-step sentence and button from TASK-239) and `jobProgressSteps` (`lib/jobs/progress-line.ts`, TASK-240). Each reads the same records with its own rules. Audit 2026-11-24.

Scope:
- `derivePipelineStage` is the one source. `computeWhatNext` becomes a lookup from stage (plus the few facts it needs, e.g. deposit due) to sentence and action. `jobProgressSteps` marks steps from the stage.
- Delete the rules this replaces.

Blocked 2026-11-25 (owner decision): a grid of job status × estimate × invoice shows `derivePipelineStage` is itself wrong in common cases (draft job with an unsent estimate → "Ready to Schedule"; quoted job with no estimate → "Estimate Sent"; in-progress job with no estimate → "Ready to Schedule"). Making it the single source would put those on the job page. Options: fold into TASK-242 (job page tabs), or the owner rules on each case first.

Out of scope:
- Changing any sentence, button or step the user sees today. `deriveCustomerStage` and `derivePortalStage` (customer and portal pages).

Acceptance Criteria:
- [ ] For every job state in the existing TASK-239 and TASK-240 unit tests, output is unchanged.
- [ ] Neither `computeWhatNext` nor `jobProgressSteps` reads job, estimate or invoice status directly.

Test Plan:
- Unit: existing what-next and progress-line tests pass unchanged; one table test feeding the same facts to all three.

Related:
TASK-239, TASK-240, TASK-242 (job page tabs; build after this or rebase on it).
