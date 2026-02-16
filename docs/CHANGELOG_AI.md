# AI Changelog

Each AI run must append one record. Keep entries factual and short.

## Entry Template
- Timestamp (UTC):
- Agent:
- Branch:
- Task ID:
- Summary:
- Files changed:
- Commands run:
- Gate results: lint/typecheck/build/test
- Risks or follow-ups:

---

- Timestamp (UTC): 2026-02-16T00:00:00Z
- Agent: codex
- Branch: local-uncommitted
- Task ID: scaffold-init
- Summary: Created full AI-first scaffold with web, worker, domain, migrations, infra, and autonomous docs.
- Files changed:
  - README.md
  - AGENTS.md
  - apps/web/*
  - services/worker/*
  - packages/domain/*
  - db/migrations/*
  - infra/*
  - scripts/*
  - docs/*
- Commands run:
  - mkdir/cat/chmod/bash -n/json parse checks
- Gate results: lint/typecheck/build/test not run yet (dependencies not installed)
- Risks or follow-ups:
  - Need first dependency install and initial gate baseline.

- Timestamp (UTC): 2026-02-16T17:45:00Z
- Agent: codex
- Branch: orchestrator/start-process-wave1
- Task ID: process-kickoff-wave1
- Summary: Started autonomous process by creating labeled GitHub task queue, wave-1 kickoff docs, and active claim assignments for P0 contract freeze.
- Files changed:
  - docs/START_PROCESS_NOW.md
  - docs/AGENT_LAUNCH_PACK.md
  - docs/WORK_ASSIGNMENT.md
- Commands run:
  - gh label create/edit
  - gh issue create/list
- Gate results: lint/typecheck/build/test not run (docs/process change only)
- Risks or follow-ups:
  - Branch protection active; merge requires PR approval.
  - Agents should claim #7/#8/#9 immediately.

- Timestamp (UTC): 2026-02-16T20:00:00Z
- Agent: agent-orchestrator (Claude Code)
- Branch: orchestrator/start-process-wave1
- Task ID: P0-T1, P0-T2, P0-T3 (#7, #8, #9)
- Summary: Froze all three P0 contracts with full source evidence from dovelite and myprogram. Updated domain Zod schemas to cover all entities (account, user, client, property, job, visit, estimate, invoice, payment, automation, audit_log) with status transition maps. Updated core migration to match frozen contract (added properties, estimate_line_items, invoice_line_items, audit_log tables; added updated_at triggers, created_by FKs, and comprehensive indexes). Updated seed data with deterministic UUIDs and two test accounts for RLS abuse testing.
- Files changed:
  - docs/contracts/domain-model.md (frozen — full entity specs, relationships, immutability rules)
  - docs/contracts/workflow-states.md (frozen — transition tables, role matrix, automation types)
  - docs/contracts/api-contract.md (frozen — all endpoints, error model, pagination, auth)
  - docs/contracts/test-strategy.md (frozen — tooling, categories, RLS abuse tests, phase rollout)
  - packages/domain/src/index.ts (full Zod schemas for all entities + transition maps + API error model)
  - db/migrations/001_core_schema.sql (complete schema matching frozen contract)
  - db/migrations/002_seed_dev.sql (two accounts, four users with deterministic UUIDs)
  - docs/WORK_ASSIGNMENT.md (P0 claims resolved)
  - CLAUDE.md (created for Claude Code onboarding)
- Commands run:
  - pnpm install
  - pnpm gate (lint ✅ typecheck ✅ build ✅ test ✅)
- Gate results: lint ✅ | typecheck ✅ | build ✅ | test ✅ (placeholder)
- Source evidence:
  - Dovelite: db/001_initial_schema.sql (visit schema), db/002_rls_policies.sql (RLS pattern), tests/fixtures.ts (deterministic UUIDs), playwright.config.ts (E2E config)
  - Myprogram: DOMAIN_MODEL.md (entity structure), RLS_POLICY_MATRIX.md (RBAC matrix), supabase/migrations/001-003 (schema, RLS, workflow invariants), EDGE_FUNCTIONS.md (API patterns)
- Risks or follow-ups:
  - Tests are still placeholders — real test infrastructure needed in P1.
  - Migration not yet applied to a real database — validate in P1-T2.
  - P0 complete — P1 tasks (auth, schema+RLS, audit, CI/CD) are now unblocked.
