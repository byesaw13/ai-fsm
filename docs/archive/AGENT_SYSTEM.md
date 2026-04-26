# Agent System

This project uses a two-layer AI execution model:

1. `agents/` define long-lived roles and ownership boundaries.
2. `skills/` define repeatable workflows that can be invoked by any agent when the task matches.

Use this system to reduce prompt sprawl, avoid mixing source-control and deployment concerns, and keep work resumable across sessions and models.

## When to use agents

Use an agent when the task needs:

- a clear ownership boundary
- repeatable handoff inputs/outputs
- conflict isolation from other workstreams

## When to use skills

Use a skill when the task is:

- repeated often
- operationally fragile
- better handled by a fixed checklist than freeform reasoning

## Core rule

The canonical source of truth remains:

- GitHub repo: `byesaw13/ai-fsm`

Deployment targets are consumers of that repo, not independent sources of truth.

## Agent roster

- `orchestrator`
- `repo-manager`
- `deploy-sre`
- `network-diagnosis`
- `product-engineer`

Read the relevant file in `docs/agents/` before acting in that role.

## Skill roster

- `ai-fsm-git-governance`
- `ai-fsm-garonhome-deploy`
- `ai-fsm-access-debug`
- `ai-fsm-phase-execution`
- `ai-fsm-release-sync`

Read the relevant file in `docs/skills/` when the task matches.

## Required operating sequence

1. Read `docs/AI_BOOTSTRAP_PROMPT.md`
2. Read `docs/AGENT_SYSTEM.md`
3. Select one agent role from `docs/agents/`
4. Select any matching skill from `docs/skills/`
5. Claim work in `docs/WORK_ASSIGNMENT.md` if product code or shared infra changes are involved
6. Execute
7. Record evidence in `docs/CHANGELOG_AI.md`
