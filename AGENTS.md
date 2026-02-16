# AGENTS.md - AI Execution Contract

This repository is an AI-first experiment with multi-agent autonomous delivery.

## Read This First
Follow `docs/MASTER_AUTONOMOUS_DIRECTIVE.md` as highest-priority project instruction.

## Prime Directive
AI should complete tasks end-to-end with minimal human input while preserving reliability and traceability.

## Non-Negotiable Rules
1. Never skip quality gates: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`.
2. Any failed gate requires auto-fix attempts before asking for help.
3. Never store secrets in code; use `.env`.
4. Migrations must be additive and reversible when possible.
5. All business logic changes must include tests or explicit TODO tests in backlog.
6. Keep Raspberry Pi 4 target constraints in mind (memory/CPU/storage).
7. Follow multi-agent protocol in `docs/MULTI_AGENT_PROTOCOL.md`.

## Decision Policy
If multiple options exist, choose the one with:
1. Lower operational complexity
2. Lower total maintenance burden
3. Lower lock-in
4. Better ARM64 compatibility

## Required Deliverable Format Per Task
1. Objective
2. Files changed
3. Commands executed
4. Gate results
5. Risks and follow-up tasks
