# TASK-209: Estimating assistant, Phase 3 slice (parent)

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3 (approved by the owner 2026-10-26; see the ROADMAP Phase 3 entry)

Problem:
Material prices on quotes have no visible source, date or trust level; most
quantities are AI guesses; receipt and Pro Xtra imports double-count; package
sizes are unknown for 1,296 of 1,304 catalog items. Design: `docs/working/estimating-assistant-phase3.md`.

Scope:
Foundation (TASK-210 to TASK-213), the paint pilot (TASK-214) and estimated vs
actual hours (TASK-215). The four follow-up formula families (TASK-216) start
only after the pilot success criteria in the design are met. Market strategy,
paid feeds and production learning stay Phase 4.

Dependencies:
PR #720 merged first (TASK-190 materials cost field, TASK-191 stored hours,
TASK-194 send checklist and freeze, and the approved hourly-baseline formula
document), then PR #721. Product implementation does not start before both.
The owner's 24-month Pro Xtra re-export is an input after deploy, not a
blocker; implementation and tests use fixture CSVs.

Acceptance Criteria:
- [ ] The parent acceptance criteria 1 to 13 in the design pass.
- [ ] No new recurring service fee is added.

Plan:
`docs/superpowers/plans/2026-10-26-estimating-assistant-phase3.md`
