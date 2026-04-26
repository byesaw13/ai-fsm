# Multi-Agent Protocol

## Goal
Allow multiple AIs to build in parallel with minimal human arbitration while following a single master directive.

## Mandatory Pre-Read
Every AI must read:
1. `docs/MASTER_AUTONOMOUS_DIRECTIVE.md`
2. `docs/PRODUCT_CONTRACT.md`
3. `docs/SYSTEM_BLUEPRINT.md`
4. `docs/TEAM_ORCHESTRATION.md`
5. role playbook under `docs/agent-playbooks/`
6. `docs/EXECUTION_GRAPH.yaml`

## Protocol
1. Select task from `docs/EXECUTION_GRAPH.yaml` and `docs/PHASED_BACKLOG.yaml`.
2. Claim task in `docs/WORK_ASSIGNMENT.md`.
3. Create branch using required naming.
4. Implement only within assigned file domain.
5. Run `pnpm gate`.
6. Append run summary to `docs/CHANGELOG_AI.md`.
7. Add/append ADR in `docs/DECISION_LOG.md` if any decision was made.
8. Open merge request with task id in title.

## Conflict Rules
- If two agents need same shared file, only first lock owner edits it.
- Second agent creates `docs/conflicts/<task-id>.md` with requested changes.
- Architect AI resolves design conflict; Orchestrator AI resolves schedule conflict.

## Required PR Checklist
- [ ] Task status updated in `docs/PHASED_BACKLOG.yaml`
- [ ] Claim row resolved in `docs/WORK_ASSIGNMENT.md`
- [ ] `docs/CHANGELOG_AI.md` appended
- [ ] `docs/DECISION_LOG.md` updated if needed
- [ ] `pnpm gate` passed

## Quality Bar
No PR merges with failing gates, even for experimental work.
