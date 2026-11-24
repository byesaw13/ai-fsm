# TASK-253: Keep only the estimate starts the owner uses

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
Low. Five ways to start an estimate cost upkeep on every estimate change.

Problem:
An estimate can start from the 4-step wizard (`estimates/new`, 7,451 lines with its hooks), Quick (`estimates/quick`), the AI interview (`EstimateInterviewFlow`), the T&M briefing (`TmBriefingFlow`) or Prepare Quote from an assessment. Each change to estimate fields (e.g. TASK-232, TASK-233, TASK-248) touches several of them. Audit 2026-11-24.

Scope:
- Step 1 (read-only): count production estimates by how they were started over the last 90 days and put the table in the PR.
- Step 2 (owner gate): the owner picks which starts stay.
- Step 3: remove the dropped starts' entry points and code (`docs/working/system-map.md` unused-code steps). Routes stay and redirect to a kept start.

Out of scope:
- Changing the kept starts.

Acceptance Criteria:
- [ ] Usage table in the PR; owner's choice recorded in the runbook Decisions register.
- [ ] Dropped starts are unreachable from the UI and their code is gone; old links redirect.

Test Plan:
- E2E: each kept start still saves an estimate.

Related:
TASK-236, TASK-248.
