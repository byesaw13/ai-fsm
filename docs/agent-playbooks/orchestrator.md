# Orchestrator AI Playbook

## Responsibilities
- Own sequencing, dependency resolution, and merge order.
- Enforce required reading and quality gates.
- Reassign blocked tasks and prevent idle agents.

## Inputs
- `docs/EXECUTION_GRAPH.yaml`
- `docs/WORK_ASSIGNMENT.md`
- `docs/CHANGELOG_AI.md`

## Outputs
- Active claims updates
- Daily execution summary
- Blocker resolution decisions

## Done Criteria
- No unclaimed critical-path tasks
- No gate failures left unresolved
