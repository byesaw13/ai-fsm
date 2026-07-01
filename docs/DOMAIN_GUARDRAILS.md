# Domain Guardrails

This document exists to keep AI-assisted changes from inventing new nouns, new workflow branches, or incompatible API shapes.

## Canonical backend terms

Keep these stable unless a migration is explicitly approved:

- `client`
- `property`
- `job`
- `work_order`
- `visit`
- `booking_request`
- `estimate`
- `invoice`
- `payment`
- `membership`
- `change_order`
- `workflow`

## Primary UI labels

Owner/staff UI uses these labels. Backend names do not change.

| Backend | Primary UI label |
|---|---|
| `job` | **Project** |
| `work_order` | **Work Order** |
| `visit` | **Visit** |

Use `primaryUiLabel()` from `packages/domain/src/vocabulary.ts` or `PRIMARY_UI_LABELS` — do not hardcode "Job" in owner-facing copy.

## Allowed presentation aliases

UI copy may use these aliases, but code and storage should keep the canonical backend terms:

- `booking_request` -> `Request`, `New Request`, `Intake`
- `job` -> `Project`
- `work_order` -> `Work Order`
- `visit` -> `Visit`, `Walkthrough`
- `estimate` -> `Estimate`, `Quote`
- `membership` -> `Membership`, `Maintenance Plan`
- `workflow` -> `Workflow`
- `flat_rate` -> `Fixed Bid`
- `hourly_internal` -> `Time and Materials`

**Retired:** `visit` -> `Work Order` (visits are not work orders).

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
4. Update canonical docs and tests in the same change when vocabulary changes.
5. Do not introduce parallel concepts unless they are explicit compatibility aliases.
6. If a change could rename a concept in storage or API, stop and describe the migration plan first.
7. Invoice and payment state stay at the project (`jobs`) level — never drive work order status from billing.

## Source files

- [docs/canonical/DOMAIN_MODEL.md](./canonical/DOMAIN_MODEL.md)
- [docs/canonical/WORKFLOW.md](./canonical/WORKFLOW.md)
- [docs/superpowers/specs/2026-07-01-job-work-order-visit-model-design.md](./superpowers/specs/2026-07-01-job-work-order-visit-model-design.md)
- [packages/domain/src/vocabulary.ts](../packages/domain/src/vocabulary.ts)