# Source Strengths Map (Dovelite + Myprogram)

This file tells AI exactly where to extract proven patterns from existing projects.

## Source Repositories
- `/home/nick/dev/dovelite`
- `/home/nick/dev/myprogram`

## Extraction Rules
1. Do not copy blindly; extract patterns and re-implement cleanly in `ai-fsm`.
2. Prefer stable, tested workflows from Dovelite.
3. Prefer domain/RLS/edge-contract patterns from Myprogram.
4. Record every major adoption in `docs/DECISION_LOG.md`.

## Dovelite Strengths (Workflow + UX)
Use these as primary references for practical product behavior.

### Product scope and setup
- `/home/nick/dev/dovelite/README.md`
- `/home/nick/dev/dovelite/READY_TO_DEPLOY.md`
- `/home/nick/dev/dovelite/SETUP_CHECKLIST.md`

### Admin/client workflow surfaces
- `/home/nick/dev/dovelite/app/admin`
- `/home/nick/dev/dovelite/app/client`
- `/home/nick/dev/dovelite/components`
- `/home/nick/dev/dovelite/lib/actions`

### Database and migration style
- `/home/nick/dev/dovelite/db`
- `/home/nick/dev/dovelite/supabase`

### Testing and QA flow
- `/home/nick/dev/dovelite/tests`
- `/home/nick/dev/dovelite/playwright.config.ts`
- `/home/nick/dev/dovelite/scripts/preflight.mjs`
- `/home/nick/dev/dovelite/scripts/qa-seed.mjs`

## Myprogram Strengths (Domain + RLS + Long-term Structure)
Use these as primary references for architecture and security boundaries.

### Domain model and policy contracts
- `/home/nick/dev/myprogram/DOMAIN_MODEL.md`
- `/home/nick/dev/myprogram/RLS_POLICY_MATRIX.md`

### Database migrations and invariants
- `/home/nick/dev/myprogram/supabase/migrations`

### Edge function service boundaries
- `/home/nick/dev/myprogram/EDGE_FUNCTIONS.md`
- `/home/nick/dev/myprogram/EDGE_FUNCTIONS_DEPLOYMENT.md`
- `/home/nick/dev/myprogram/EDGE_FUNCTIONS_RUNBOOK.md`
- `/home/nick/dev/myprogram/supabase/functions`

### Multi-app frontend/package organization
- `/home/nick/dev/myprogram/frontend/apps`
- `/home/nick/dev/myprogram/frontend/packages`
- `/home/nick/dev/myprogram/frontend/turbo.json`

## Mandatory Mapping Table
AI must enforce this mapping during implementation.

1. Jobs/Visits UX: Dovelite first, then normalize to Myprogram domain terms.
2. Estimates/Invoices workflow: Dovelite interaction patterns + Myprogram invariants.
3. Auth/Roles/Tenancy: Myprogram model and RLS matrix first.
4. Test strategy: Dovelite practical QA scripts + Myprogram abuse/security mindset.
5. Deployment/runbooks: blend Dovelite deploy pragmatism with Myprogram function runbooks.

## Evidence Requirement
For each major feature PR, add to changelog:
- Source files consulted (dovelite/myprogram path)
- What was adopted
- What was intentionally changed and why
