# AGENTS.md - Execution Contract

This repository uses AI-assisted development, but product direction is defined only by the canonical documentation set.

## Documentation Hierarchy

Use documentation in this order:

1. Code and database migrations are the implemented truth.
2. `docs/canonical/` is the authoritative product, domain, and architecture truth.
3. `docs/contracts/` and `docs/working/` contain supporting implementation notes.
4. `ai/` is only a compact AI-agent quick-reference layer.
5. `docs/archive/` and `docs/generated/` are historical/evidence only, not active instruction sources.

## Read This First

Product direction:

- `docs/canonical/PRODUCT_VISION.md`
- `docs/canonical/DOMAIN_MODEL.md`
- `docs/canonical/WORKFLOW.md`
- `docs/canonical/ARCHITECTURE.md`
- `docs/canonical/ROADMAP.md`

Archived, generated, and working documents may provide evidence, implementation notes, or historical context. They do not override canonical docs.

Active implementation backlog: docs/backlog/README.md

## Prime Directive

Complete requested tasks end-to-end while preserving reliability, traceability, and canonical product scope.

## Non-Negotiable Rules

1. Never skip relevant quality gates for code changes.
2. Any failed gate requires fix attempts before asking for help.
3. Never store secrets in code; use `.env`.
4. Migrations must be additive and reversible unless a migration plan is explicit.
5. Business logic changes must include tests or an explicit documented test gap.
6. Production runs on garonhome.local using `infra/compose.garonhome.yml`.
7. Do not use archived or generated planning documents as product instructions.

## Decision Policy

If multiple options exist, choose the one with:

1. Lower operational complexity.
2. Lower total maintenance burden.
3. Better alignment with canonical product direction.
4. Better compatibility with garonhome.local.

## Required Deliverable Format Per Task

1. Objective
2. Files changed
3. Commands executed
4. Gate results
5. Risks and follow-up tasks
