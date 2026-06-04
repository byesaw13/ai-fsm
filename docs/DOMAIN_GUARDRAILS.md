# Domain Guardrails

This document exists to keep AI-assisted changes from inventing new nouns, new workflow branches, or incompatible API shapes.

## Canonical backend terms

Keep these stable unless a migration is explicitly approved:

- `client`
- `property`
- `job`
- `visit`
- `booking_request`
- `estimate`
- `invoice`
- `payment`
- `membership`
- `change_order`
- `workflow`

## Allowed presentation aliases

UI copy may use these aliases, but code and storage should keep the canonical backend terms:

- `booking_request` -> `Request`, `New Request`, `Intake`
- `job` -> `Job`, `Project`
- `visit` -> `Visit`, `Walkthrough`, `Work Order`
- `estimate` -> `Estimate`, `Quote`
- `membership` -> `Membership`, `Maintenance Plan`
- `workflow` -> `Workflow`
- `flat_rate` -> `Fixed Bid`
- `hourly_internal` -> `Time and Materials`

## Deprecated frontend terms

Treat these as retired UI vocabulary unless they are part of a compatibility alias or a historical reference:

- `lead`
- `pipeline`
- `ticket`
- `subscription`
- `appointment`
- `asset`
- `dispatch`

## Rules

1. Keep backend tables, routes, columns, and status enums stable unless a migration is explicit.
2. Use UI aliases only in presentation components, not in the API contract.
3. Use one adapter layer for translations between old labels and canonical terms.
4. Update the glossary, workflow map, and tests in the same change when vocabulary changes.
5. Do not introduce parallel concepts unless they are explicit compatibility aliases.
6. If a change could rename a concept in storage or API, stop and describe the migration plan first.

## Source files

- [docs/domain/terminology.md](./domain/terminology.md)
- [docs/WORKFLOW_MAP.md](./WORKFLOW_MAP.md)
- [packages/domain/src/vocabulary.ts](/home/nick/ai-fsm-deploy-clean/packages/domain/src/vocabulary.ts)
