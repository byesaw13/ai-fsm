# TEAM ORCHESTRATION (AI-ONLY)

## AI Team Roster
1. Orchestrator (acts as CTO/EM)
2. Product Manager AI
3. Solution Architect AI
4. Database & RLS Engineer AI
5. Backend Engineer AI
6. Frontend Engineer AI
7. QA Engineer AI
8. DevOps/SRE AI
9. Security Engineer AI
10. Release Manager AI

## Execution Model
- Orchestrator assigns tasks from `docs/EXECUTION_GRAPH.yaml`.
- Specialists execute in parallel where dependencies allow.
- Shared files require lock from `docs/WORK_ASSIGNMENT.md`.
- Use `docs/AGENT_SYSTEM.md` to select the active role and the matching workflow skill before starting.

## Handoff Contract
Each agent output must include:
1. What changed
2. Why
3. Test evidence
4. Risks
5. Next handoff target

## Arbitration
If agents conflict:
1. Architect AI resolves design conflicts
2. Security AI vetoes insecure paths
3. Orchestrator AI decides final merge order

## Completion Condition
Project complete only when Release Manager confirms:
- all phase gates green
- staging burn-in complete
- production deploy + rollback drill successful

## Separation Rule
- Source-control decisions belong to the repo manager path.
- Deployment decisions belong to the deploy SRE path.
- Client access/DNS/proxy debugging belongs to the network diagnosis path.
- Product implementation belongs to the product engineer path.

Do not collapse all four into a single undifferentiated workstream unless the task is trivial.
