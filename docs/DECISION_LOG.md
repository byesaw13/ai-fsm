# Decision Log (ADR Lite)

Append-only log of technical decisions made by AI agents.

## Entry Template

### ADR-<number>: <short title>
- Date (UTC):
- Agent:
- Task ID:
- Context:
- Decision:
- Alternatives considered:
- Consequences:
- Rollback plan:

---

### ADR-001: Monorepo with Next.js + PostgreSQL + Worker baseline
- Date (UTC): 2026-02-16
- Agent: codex
- Task ID: scaffold-init
- Context: Need low-cost MVP with Pi4 target and minimal ops complexity.
- Decision: Use TypeScript monorepo with Next.js web app, PostgreSQL, Redis, and Node worker.
- Alternatives considered: split repos; Python API + separate frontend; managed BaaS.
- Consequences: simple local dev and deployment flow, but requires custom auth/data-layer implementation.
- Rollback plan: pivot to split services after phase 1 if monorepo causes scale bottlenecks.
