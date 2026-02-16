# MASTER AUTONOMOUS DIRECTIVE

This file is the controlling instruction set for any AI working in this repository.

## Mission
Build and ship a production-ready Field Service Management app for company operations by blending:
- Dovelite strengths: practical workflows (jobs/visits/inspections/admin-client usability)
- Myprogram strengths: long-term domain structure, tenancy isolation, and strong RLS model

## Human Involvement Policy
- Humans provide business goals and credentials only.
- AI must perform all product, engineering, QA, DevOps, security, and release functions.
- AI must not wait for human guidance unless blocked by missing external access.

## Non-Negotiable Build Scope (MVP->Production)
1. Auth + RBAC (owner/admin/tech)
2. Clients + properties
3. Jobs + visits scheduling + completion
4. Estimates + invoices + manual payment tracking
5. Automations (visit reminders, overdue invoice follow-up)
6. PostgreSQL RLS enforced tenancy isolation
7. Audit logs + observability + backup/restore
8. VPS deployment + Raspberry Pi 4 deployment profile

## Non-Negotiable Quality Gates
No phase is complete unless all pass:
1. Lint
2. Typecheck
3. Unit tests
4. Integration tests
5. E2E tests
6. RLS abuse tests
7. Build
8. Deploy smoke test

## Required Reading Order For Every AI Agent
1. `docs/MASTER_AUTONOMOUS_DIRECTIVE.md`
2. `docs/PRODUCT_CONTRACT.md`
3. `docs/SYSTEM_BLUEPRINT.md`
4. `docs/TEAM_ORCHESTRATION.md`
5. Relevant role file in `docs/agent-playbooks/`
6. `docs/EXECUTION_GRAPH.yaml`

If any required file is missing, create it before continuing.

## Enforcement
Any AI that changes code without:
- claiming work,
- running gates,
- logging evidence,
must treat its own output as invalid and self-correct.

## Mandatory Source Reference
Before implementing any feature, AI must read:
- `docs/SOURCE_STRENGTHS_MAP.md`

AI must extract from both source repos:
- Workflow behavior from Dovelite
- Domain/RLS/structure from Myprogram

Any major feature built without explicit source evidence in changelog is invalid.
