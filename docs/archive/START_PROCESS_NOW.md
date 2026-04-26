# Start Process Now (Wave 1)

This is the immediate launch sequence for autonomous execution.

## Step 1: Launch Orchestrator AI
Prompt source: `docs/AI_BOOTSTRAP_PROMPT.md`
Role file: `docs/agent-playbooks/orchestrator.md`

Orchestrator first actions:
1. Confirm required docs are present.
2. Ensure task claims are active in `docs/WORK_ASSIGNMENT.md`.
3. Monitor issue queue in GitHub.

## Step 2: Launch Wave 1 Specialist Agents (in parallel)
1. Product+Architect AI -> issue `#7` (`P0-T1`)
2. Architect+Backend AI -> issue `#8` (`P0-T2`)
3. QA+Security AI -> issue `#9` (`P0-T3`)

## Step 3: Enforce Completion Hand-off
For each Wave 1 PR:
1. Must include gate results.
2. Must include source evidence from `dovelite` and `myprogram`.
3. Must update `docs/CHANGELOG_AI.md` and `docs/DECISION_LOG.md` if decisions were made.

## Step 4: Unlock Phase 1
Only after issues #7, #8, #9 are complete, launch:
- #10 P1-T1
- #11 P1-T2
- #12 P1-T3
- #13 P1-T4

## Stop Conditions
- Any gate failure
- Any unresolved cross-agent conflict in shared file
- Any missing security evidence for auth/RLS changes
