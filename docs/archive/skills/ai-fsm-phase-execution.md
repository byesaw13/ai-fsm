# Skill: ai-fsm-phase-execution

Use this skill for:

- P7/P8 task execution
- multi-step product work
- handing tasks between Claude sessions

## Required sequence

1. identify task in `docs/PHASED_BACKLOG.yaml`
2. claim it in `docs/WORK_ASSIGNMENT.md`
3. create branch from `origin/main`
4. implement only the scoped task
5. run gates
6. update:
   - `docs/CHANGELOG_AI.md`
   - `docs/PHASED_BACKLOG.yaml`
   - `docs/WORK_ASSIGNMENT.md`
7. open PR with:
   - what changed
   - files touched
   - gate results
   - risks/follow-ups

## Anti-drift rule

Do not silently move to another repo or deployment target. State the active repo and host explicitly at the start.
