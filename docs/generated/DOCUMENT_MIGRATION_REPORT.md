# Document Migration Report

Date: 2026-06-04

## Scope

Documentation Cleanup Phase 1 only changed documentation files. No application code was changed.

## Created Folders

- `docs/canonical`
- `docs/working`
- `docs/archive`
- `docs/generated`
- `docs/archive/phase-1`

## Created Canonical Files

- `docs/canonical/PRODUCT_VISION.md`
- `docs/canonical/DOMAIN_MODEL.md`
- `docs/canonical/WORKFLOW.md`
- `docs/canonical/ARCHITECTURE.md`
- `docs/canonical/ROADMAP.md`

## Updated Entry Documents

- `README.md`
- `CLAUDE.md`
- `AGENTS.md`

These files now point only at `docs/canonical/*` for product direction.

## Moved Files

### Archived product and planning documents

| From | To |
|---|---|
| `docs/DOVETAILS_PRODUCT_ALIGNMENT_ROADMAP.md` | `docs/archive/phase-1/root/DOVETAILS_PRODUCT_ALIGNMENT_ROADMAP.md` |
| `docs/IMPLEMENTATION_PROMPTS.md` | `docs/archive/phase-1/root/IMPLEMENTATION_PROMPTS.md` |
| `docs/PRODUCT_CONTRACT.md` | `docs/archive/phase-1/root/PRODUCT_CONTRACT.md` |
| `docs/ARCHITECTURE.md` | `docs/archive/phase-1/root/ARCHITECTURE.md` |
| `docs/WORKFLOW_MAP.md` | `docs/archive/phase-1/root/WORKFLOW_MAP.md` |
| `docs/WORKFLOW_CENTERING.md` | `docs/archive/phase-1/root/WORKFLOW_CENTERING.md` |
| `docs/USAGE_PLAN.md` | `docs/archive/phase-1/root/USAGE_PLAN.md` |
| `docs/operationpipeline` | `docs/archive/phase-1/root/operationpipeline` |

### Archived domain and terminology documents

| From | To |
|---|---|
| `docs/domain/domain-model.md` | `docs/archive/phase-1/domain/domain-model.md` |
| `docs/domain/terminology.md` | `docs/archive/phase-1/domain/terminology.md` |
| `docs/domain/ownership-matrix.md` | `docs/archive/phase-1/domain/ownership-matrix.md` |
| `docs/architecture/domain-language.md` | `docs/archive/phase-1/architecture/domain-language.md` |
| `docs/architecture/membership-pricing.md` | `docs/archive/phase-1/architecture/membership-pricing.md` |
| `docs/contracts/domain-model-frozen-p0t1.md` | `docs/archive/phase-1/contracts/domain-model-frozen-p0t1.md` |

### Archived UX phase documents

| From | To |
|---|---|
| `docs/ux/P7_UX_SPEC.md` | `docs/archive/phase-1/ux/P7_UX_SPEC.md` |
| `docs/ux/P7_INTERACTION_PATTERNS.md` | `docs/archive/phase-1/ux/P7_INTERACTION_PATTERNS.md` |
| `docs/ux/P7_SCREEN_MAP.md` | `docs/archive/phase-1/ux/P7_SCREEN_MAP.md` |

### Generated reports and audits

| From | To |
|---|---|
| `docs/DOCUMENTATION_RATIONALIZATION_REPORT.md` | `docs/generated/DOCUMENTATION_RATIONALIZATION_REPORT.md` |
| `docs/RELEASE_MANIFEST.md` | `docs/generated/RELEASE_MANIFEST.md` |
| `docs/deep-research-report.md` | `docs/generated/deep-research-report.md` |
| `docs/DOMAIN_SIMPLIFICATION_AUDIT.md` | `docs/generated/root/DOMAIN_SIMPLIFICATION_AUDIT.md` |
| `docs/domain/audit-2026-05-16.md` | `docs/generated/domain/audit-2026-05-16.md` |

### Working implementation references

| From | To |
|---|---|
| `docs/domain/workflow-model.md` | `docs/working/domain/workflow-model.md` |
| `docs/architecture/property-timeline.md` | `docs/working/architecture/property-timeline.md` |
| `docs/architecture/booking-request-boundaries.md` | `docs/working/architecture/booking-request-boundaries.md` |
| `docs/architecture/audit-status-history.md` | `docs/working/architecture/audit-status-history.md` |

## Archived Files

The archived files are preserved under `docs/archive/phase-1` because they contain old strategy, phase plans, dashboard/membership expansion, old domain source-of-truth claims, or historical UX plans that should no longer instruct product direction.

No archived file was deleted.

## Merged Files

These source documents were merged into the new canonical layer:

| Canonical file | Source material merged |
|---|---|
| `docs/canonical/PRODUCT_VISION.md` | `docs/PRODUCT_CONTRACT.md`, `README.md`, `CLAUDE.md`, `docs/generated/DOCUMENTATION_RATIONALIZATION_REPORT.md` |
| `docs/canonical/DOMAIN_MODEL.md` | `docs/domain/domain-model.md`, `docs/DOMAIN_SIMPLIFICATION_AUDIT.md`, `docs/DOMAIN_GUARDRAILS.md` |
| `docs/canonical/WORKFLOW.md` | `docs/WORKFLOW_MAP.md`, `docs/WORKFLOW_CENTERING.md`, `docs/domain/workflow-model.md` |
| `docs/canonical/ARCHITECTURE.md` | `docs/ARCHITECTURE.md`, `CLAUDE.md`, deployment/runbook context |
| `docs/canonical/ROADMAP.md` | `docs/DOVETAILS_PRODUCT_ALIGNMENT_ROADMAP.md`, `docs/IMPLEMENTATION_PROMPTS.md`, rationalization recommendations |

## Deleted Files

None.

## Broken References

Active markdown/code reference scan result:

```text
BROKEN_COUNT=0
```

Checks performed:

- Active references to moved phase-1 source paths: none found outside `docs/archive` and `docs/generated`.
- Active local markdown link existence check: zero broken links.
- New canonical/root docs non-ASCII scan: no non-ASCII characters found.

One active reference was updated:

- `docs/CI_GOVERNANCE.md`: `docs/RELEASE_MANIFEST.md` -> `docs/generated/RELEASE_MANIFEST.md`

One active guardrail reference set was updated:

- `docs/DOMAIN_GUARDRAILS.md`: old `docs/domain/terminology.md` and `docs/WORKFLOW_MAP.md` links now point to canonical domain/workflow docs.

## Remaining Duplicates

These duplicates remain intentionally for Phase 2 cleanup:

- `docs/INCIDENT_RESPONSE.md` and `docs/INCIDENT_RESPONSE_RUNBOOK.md` both exist. They should be collapsed into one incident runbook after comparing current operational content.
- `docs/DEPLOYMENT_RUNBOOK.md`, `docs/GARONHOME_DEPLOYMENT.md`, `docs/BACKUP_RUNBOOK.md`, and `docs/PROD_READINESS_CHECKLIST.md` overlap on backup, restore, deploy, and rollback procedures.
- `docs/TEST_MATRIX.md` and `docs/contracts/test-strategy.md` overlap. `docs/TEST_MATRIX.md` remains at its current path because application test comments reference it.
- `docs/DECISION_LOG.md` contains historical product decisions, including old membership and dashboard references. It remains active as a decision history, not product law.
- `docs/working/domain/workflow-model.md` preserves detailed status/membership-phase material as working technical context. It should not define product direction.
- Pricing PDFs and `DOVETAILS_PRICING_CONTRACT.md` remain outside the canonical layer. They are pricing support material, not product identity.

## Phase 2 Recommendation

Phase 2 should consolidate working operational docs, decide whether `docs/INCIDENT_RESPONSE.md` or `docs/INCIDENT_RESPONSE_RUNBOOK.md` survives, and either update or archive remaining working notes that still contain old membership/dashboard language.
