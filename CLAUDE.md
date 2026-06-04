# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project Overview

Dovetails FSM is a residential handyman and home maintenance operating system. The product direction is property-centered: client relationships, property history, estimates, jobs, visits, invoices, and permanent service records.

Use only these canonical docs for product direction:

- `docs/canonical/PRODUCT_VISION.md`
- `docs/canonical/DOMAIN_MODEL.md`
- `docs/canonical/WORKFLOW.md`
- `docs/canonical/ARCHITECTURE.md`
- `docs/canonical/ROADMAP.md`

Working, archived, and generated documents can provide implementation evidence or historical context, but they do not define product scope.

## Commands

```bash
pnpm dev          # Run web + worker in parallel
pnpm dev:web      # Web app only (port 3000)
pnpm dev:worker   # Worker only
pnpm build        # Build all workspaces
pnpm lint         # Lint all workspaces
pnpm typecheck    # Typecheck all workspaces
pnpm test         # Test all workspaces (unit only)
pnpm test:unit    # Unit tests only (no infra required)
pnpm test:integration  # Integration tests (requires TEST_DATABASE_URL + TEST_BASE_URL)
pnpm test:e2e     # Playwright E2E (requires running server + seeded DB)
pnpm gate         # Full gate: lint -> typecheck -> build -> unit -> integration -> e2e
pnpm gate:fast    # Fast gate: lint -> typecheck -> build -> unit
pnpm db:migrate   # Apply SQL migrations
pnpm db:seed      # Seed dev data
```

Run a single workspace: `pnpm --filter @ai-fsm/web <script>` (or `@ai-fsm/worker`, `@ai-fsm/domain`).

Local dev services:

```bash
docker compose -f infra/compose.dev.yml up -d postgres redis
```

## Architecture

Canonical technical overview: `docs/canonical/ARCHITECTURE.md`.

Core repo layout:

- `apps/web/`: Next.js app router UI and API routes.
- `services/worker/`: background queue/automation worker.
- `packages/domain/`: shared domain schemas, labels, constants, and helpers.
- `db/migrations/`: SQL migrations and persistence contracts.
- `infra/`: Docker Compose profiles for local and production targets.

## Documentation Rules

1. Product scope changes must update canonical docs first or in the same change.
2. Do not use archived or generated docs as build instructions.
3. Do not reintroduce generic FSM, SaaS, subscription, dashboard-suite, or AI-first product positioning unless canonical docs change.
4. Keep implementation/runbook details in `docs/working`.
5. Keep reports, audits, and migration records in `docs/generated`.

## Non-Negotiable Rules

1. Never skip relevant quality gates for code changes.
2. Never store secrets in code; use `.env`.
3. Migrations must be additive and reversible unless a migration plan is explicit.
4. Business logic changes require tests or an explicit documented test gap.
5. Production runs on garonhome.local via `infra/compose.garonhome.yml`.

## Decision Policy

When multiple options exist, prefer:

1. Lower operational complexity.
2. Lower maintenance burden.
3. Better alignment with canonical product direction.
4. Better compatibility with garonhome.local.

## Dovetails Layer

**Dovetails Services LLC** is the local handyman and home maintenance business this software is being built to run. Dovetails-specific schema and helpers are first-party business logic, not a third-party integration.

Dovetails-specific code currently includes:

- `packages/domain/src/dovetails.ts`
- `db/migrations/013_dovetails_domain.sql`

For product decisions, read `docs/canonical/*` instead of old roadmap or phase documents.
