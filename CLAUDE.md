# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-FSM is an AI-first Field Service Management MVP for small service companies. Core domains: Jobs & Visits, Estimates & Invoices, Automations. Production target is Raspberry Pi 4 (ARM64, constrained memory).

## Commands

```bash
pnpm dev          # Run web + worker in parallel
pnpm dev:web      # Web app only (port 3000)
pnpm dev:worker   # Worker only
pnpm build        # Build all workspaces
pnpm lint         # Lint all workspaces
pnpm typecheck    # Typecheck all workspaces
pnpm test         # Test all workspaces
pnpm gate         # Quality gate: lint && typecheck && build && test (MUST pass before PR)
pnpm db:migrate   # Apply SQL migrations
pnpm db:seed      # Seed dev data
```

Run a single workspace: `pnpm --filter @ai-fsm/web <script>` (or `@ai-fsm/worker`, `@ai-fsm/domain`).

Local dev services: `docker compose -f infra/compose.dev.yml up -d postgres redis`

## Architecture

**Monorepo** (pnpm workspaces, Node >=20, TypeScript 5.7 strict):

- `apps/web/` — Next.js 15 app (app router, React 19). API routes in `app/api/`, protected pages in `app/app/`.
- `services/worker/` — Automation worker (polling/queue consumer, tsx for dev).
- `packages/domain/` — Shared Zod schemas and TypeScript types for all status enums and entities.
- `db/migrations/` — Raw SQL migrations (additive, reversible). Schema uses `account_id` on all entities for multi-tenant RLS.
- `infra/` — Docker Compose profiles: `compose.dev.yml` (local), `compose.prod.yml` (VPS), `compose.pi.yml` (Raspberry Pi with memory limits).

**Stack**: PostgreSQL 16 + Redis 7 + Next.js 15 + Zod. No ORM — raw SQL with RLS.

## AI Governance

This repo uses multi-agent autonomous development. Key docs (read in order):

1. `AGENTS.md` — Execution contract and non-negotiable rules
2. `docs/MASTER_AUTONOMOUS_DIRECTIVE.md` — Highest priority project instruction
3. `docs/PRODUCT_CONTRACT.md` — Acceptance criteria
4. `docs/SYSTEM_BLUEPRINT.md` — Architecture and data rules
5. `docs/TEAM_ORCHESTRATION.md` — AI team roles and handoff contracts
6. `docs/EXECUTION_GRAPH.yaml` — Phased execution plan (P0–P5)
7. `docs/WORK_ASSIGNMENT.md` — File ownership domains and active claims

Agent playbooks live in `docs/agent-playbooks/`. Role-specific prompts in `docs/prompts/`.

## Non-Negotiable Rules

1. Never skip `pnpm gate`. Failed gate requires auto-fix before asking for help.
2. Never store secrets in code — use `.env`.
3. Migrations must be additive and reversible.
4. Business logic changes require tests or explicit TODO in backlog.
5. Keep Raspberry Pi 4 constraints in mind (memory/CPU/storage).
6. Follow multi-agent protocol in `docs/MULTI_AGENT_PROTOCOL.md`.

## Decision Policy

When multiple options exist, prefer: lower operational complexity > lower maintenance burden > lower lock-in > better ARM64 compatibility.

## Conventions

- **Commits**: Conventional commits (feat/fix/docs/chore). Use `scripts/auto-commit.sh` for message generation.
- **Branches**: `<agent-id>/<task-id>-<short-slug>` (e.g., `agent-a/P0-T1-domain-workflow-freeze`).
- **PR checklist**: Update `docs/PHASED_BACKLOG.yaml` status, resolve claim in `docs/WORK_ASSIGNMENT.md`, append to `docs/CHANGELOG_AI.md`, record decisions in `docs/DECISION_LOG.md`, pass `pnpm gate`.
- **Shared files** (`packages/domain/src/index.ts`, `docs/PHASED_BACKLOG.yaml`, `AGENTS.md`, `README.md`) require a lock before editing — see `docs/WORK_ASSIGNMENT.md`.

## Domain Model

Status enums defined in `packages/domain/src/index.ts`:
- **Job**: draft → quoted → scheduled → in_progress → completed → invoiced
- **Visit**: scheduled → arrived → in_progress → completed | cancelled
- **Estimate**: draft → sent → approved | declined | expired
- **Invoice**: draft → sent → partial | paid | overdue | void
- **Roles**: owner, admin, tech

## External References

Pattern sources (extract and re-implement, don't copy):
- `/home/nick/dev/dovelite` — Workflow + UX patterns, testing/QA
- `/home/nick/dev/myprogram` — Domain model, RLS policies, edge functions
