# AI Execution Protocol

## Goal
Build and harden the FSM MVP (jobs/visits, estimates/invoices, automations) for self-hosted deployment with Raspberry Pi 4 as final runtime target.

## Autonomous Loop
1. Pull next task from `docs/PHASED_BACKLOG.yaml`.
2. Implement smallest vertical slice.
3. Run quality gates.
4. Fix defects.
5. Update backlog status and evidence.
6. Repeat.

## Escalate to Human Only If
1. Legal/business decision is ambiguous.
2. Production data migration is destructive.
3. External credential access is blocked.

## Standards
- TypeScript strict mode required.
- SQL migrations in `db/migrations` only.
- API contract changes must update domain types.
- Every automation must be idempotent.

## Definition of Done
1. Feature works in UI/API flow.
2. Schema + tests updated.
3. CI quality workflow passes.
4. Documentation updated.
