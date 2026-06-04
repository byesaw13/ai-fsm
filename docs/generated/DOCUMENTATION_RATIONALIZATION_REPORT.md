# Documentation Rationalization Report

Date: 2026-06-04

## Executive Summary

The documentation set confirms a product identity problem more than a technical debt problem. The repo has working software for a residential handyman and home maintenance operating system, but the docs still preserve several older strategic directions: generic FSM, multi-agent AI delivery, membership/subscription expansion, dashboard proliferation, and broad platform reconstruction.

Recommended action: create a small canonical documentation layer, move everything else into working/archive/generated buckets, and stop allowing old planning documents to instruct future implementation.

## Proposed Product Identity

Dovetails FSM is a residential handyman and home maintenance operating system focused on preserving property history, managing client relationships, creating accurate estimates, executing work efficiently, and maintaining a permanent service record for every property.

This identity keeps the useful product center:

- Client relationship management
- Property history and service record
- Estimates and pricing guardrails
- Job and visit execution
- Invoices and payment history

It de-emphasizes:

- Generic field service platform positioning
- SaaS/multi-company strategy
- Advanced membership/subscription strategy
- Dashboard proliferation
- AI-first branding as product identity

## Recommended Doc Structure

Create these top-level folders:

```text
docs/canonical
docs/working
docs/archive
docs/generated
```

Recommended canonical docs:

```text
docs/canonical/PRODUCT_VISION.md
docs/canonical/DOMAIN_MODEL.md
docs/canonical/CANONICAL_WORKFLOW.md
docs/canonical/TERMINOLOGY.md
docs/canonical/ARCHITECTURE.md
docs/canonical/ROADMAP.md
```

Canonical means "law." Working means active implementation support. Archive means preserved history, not build instruction. Generated means reports, release artifacts, audits, and machine-produced summaries.

## Canonical Rewrite Targets

| New canonical doc | Source material to use | Rewrite instruction |
|---|---|---|
| `PRODUCT_VISION.md` | `docs/PRODUCT_CONTRACT.md`, `README.md`, `CLAUDE.md`, product identity sentence above | One page. Remove AI-first/FSM-platform framing. Make property history and residential maintenance the center. |
| `DOMAIN_MODEL.md` | `docs/domain/domain-model.md`, `docs/DOMAIN_SIMPLIFICATION_AUDIT.md` | Limit primary model to Client, Property, Estimate, Job, Visit, Invoice. Mention booking requests only as intake evidence. Move memberships/vault/issues/automation to supporting sections or working docs. |
| `CANONICAL_WORKFLOW.md` | `docs/domain/workflow-model.md`, `docs/WORKFLOW_MAP.md`, `docs/WORKFLOW_CENTERING.md` | Use the simple flow: Lead -> Client -> Property -> Estimate -> Job -> Visit -> Invoice -> History. Keep DB lifecycle details separate. |
| `TERMINOLOGY.md` | `docs/domain/terminology.md`, `docs/architecture/domain-language.md` | One word, one definition. Remove deprecated-term expansion except a short "do not use" list. |
| `ARCHITECTURE.md` | `docs/ARCHITECTURE.md`, deployment/runbook docs for infrastructure references | High-level technical map only. No product strategy. |
| `ROADMAP.md` | `docs/DOVETAILS_PRODUCT_ALIGNMENT_ROADMAP.md`, `docs/IMPLEMENTATION_PROMPTS.md` | Current priorities only. Remove historical phase log, membership buildout, dashboard strategy, and future dreams. |

## Disposition Legend

- Canonical: promote or rewrite into the six source-of-truth docs.
- Working: keep as implementation/runbook support, but not product law.
- Archive: preserve for history; do not use as instruction.
- Delete: remove after any useful content has been merged elsewhere.

## Full Markdown Inventory

| Document | Purpose | Direction fit | Duplication / drift | Recommendation |
|---|---|---|---|---|
| `README.md` | Repo overview, quick start, layout, gate, production note. | Partial. Still says "AI-first Field Service Management MVP." | Duplicates `CLAUDE.md` and `PRODUCT_CONTRACT.md` at a shallow level. | Working. Rewrite summary after canonical `PRODUCT_VISION.md` exists. |
| `CLAUDE.md` | Claude/Codex guidance, commands, architecture, domain model, Dovetails notes. | Partial. Useful operationally, but AI-first and generic FSM framing dominate. | Duplicates `AGENTS.md`, `README.md`, and older AI governance docs. References archived docs. | Working. Update to point only at canonical docs plus gate/deploy commands. |
| `AGENTS.md` | AI execution contract and rules. | Low as product doc; useful as agent operations. | Duplicates archived multi-agent documents and `CLAUDE.md`. | Working. Keep short; remove product direction language. |
| `DOVETAILS_PRICING_CONTRACT.md` | Pricing constants and estimate guardrail rules. | Strong. Estimate engine is core to current direction. | Overlaps pricing sections in roadmap and domain docs. | Working, with key pricing principles referenced from canonical `DOMAIN_MODEL.md` or `ROADMAP.md`. |
| `docs/PRODUCT_CONTRACT.md` | Product outcome, personas, workflows, module acceptance criteria. | Partial. Good MVP clarity, but still generic FSM. | Duplicates README and future canonical vision/workflow. | Canonical input. Rewrite into `docs/canonical/PRODUCT_VISION.md`; then archive original. |
| `docs/ARCHITECTURE.md` | Technical architecture source. | Strong if limited to technical structure. | May duplicate deployment/runbook material. | Canonical input. Rewrite or move to `docs/canonical/ARCHITECTURE.md`. |
| `docs/DOVETAILS_PRODUCT_ALIGNMENT_ROADMAP.md` | Long phase/status roadmap and shipped release log. | Mixed. Contains valuable shipped facts but preserves membership, concierge, routing, dashboard, and phase-era strategy. | Duplicates implementation prompts, pricing contract, domain docs, and release manifest. | Archive after extracting a short current `docs/canonical/ROADMAP.md`. |
| `docs/DOMAIN_SIMPLIFICATION_AUDIT.md` | Domain overlap audit and simplification proposal. | Strong diagnostic value. | Duplicates domain model, terminology, workflow docs; still endorses membership as a product concept. | Generated or Archive. Use as source input, not canonical law. |
| `docs/DOMAIN_GUARDRAILS.md` | Domain guardrails. | Likely useful if it constrains current model. | Overlaps canonical domain/terminology docs. | Working. Merge stable rules into canonical domain docs, then archive if redundant. |
| `docs/WORKFLOW_MAP.md` | Workflow map. | Potentially strong if simplified. | Duplicates workflow model and workflow centering. | Canonical input. Merge into `CANONICAL_WORKFLOW.md`, then archive. |
| `docs/WORKFLOW_CENTERING.md` | Workflow-centering guidance. | Potentially strong if focused on simple product flow. | Duplicates workflow docs. | Canonical input or Archive after merge. |
| `docs/IMPLEMENTATION_PROMPTS.md` | Completed prompt backlog. | Low for current product direction; useful history only. | Duplicates roadmap and release history. Includes Operations Dashboard prompt. | Archive. |
| `docs/USAGE_PLAN.md` | Usage/operating plan. | Unknown from title; likely operational support. | May duplicate product contract or runbooks. | Working until reviewed deeply; archive if it contains old strategy. |
| `docs/DECISION_LOG.md` | Decision history. | Useful as history, not product law. | Can conflict with newer canonical direction. | Working or Generated. Keep, but prepend rule that canonical docs override old entries. |
| `docs/RELEASE_MANIFEST.md` | Release record. | Useful history. | Duplicates roadmap shipped baseline. | Generated. |
| `docs/deep-research-report.md` | Research/evaluation report. | Useful as diagnosis, not instruction. | May preserve broad platform ideas. | Generated. |
| `docs/TEST_MATRIX.md` | Test coverage matrix. | Strong operational fit. | Duplicates contracts/test-strategy. | Working. |
| `docs/PROD_READINESS_CHECKLIST.md` | Production readiness gates. | Strong operational fit. | Duplicates deployment/backup/incident runbooks. | Working. |
| `docs/DEPLOYMENT_RUNBOOK.md` | Deployment operations. | Strong operational fit. | Duplicates `GARONHOME_DEPLOYMENT.md`. | Working. Consolidate with garonhome doc later. |
| `docs/GARONHOME_DEPLOYMENT.md` | Garonhome deployment blueprint. | Strong operational fit. | Duplicates deployment runbook. | Working. Keep if it remains the concrete target. |
| `docs/BACKUP_RUNBOOK.md` | Backup operations. | Strong operational fit. | Duplicates readiness checklist and garonhome deployment. | Working. |
| `docs/INCIDENT_RESPONSE.md` | Incident response guide. | Operational, not product direction. | Duplicates incident runbook. | Delete after merging into `INCIDENT_RESPONSE_RUNBOOK.md`, or archive one copy. |
| `docs/INCIDENT_RESPONSE_RUNBOOK.md` | Incident response runbook. | Operational, not product direction. | Duplicates incident response. | Working. Keep one incident doc. |
| `docs/CI_GOVERNANCE.md` | CI process and governance. | Operational, not product direction. | Has archived duplicate. | Working. |
| `docs/contracts/api-contract.md` | API contract. | Strong technical support if current. | May duplicate architecture/domain contracts. | Working. |
| `docs/contracts/domain-model-frozen-p0t1.md` | Frozen early domain model. | Low for current direction. | Conflicts with current domain model and simplification audit. | Archive. |
| `docs/contracts/workflow-states.md` | Frozen workflow states contract. | Useful technical constraint, not product law. | Duplicates workflow model. | Working. Keep as DB/status contract referenced by canonical workflow. |
| `docs/contracts/test-strategy.md` | Test strategy. | Strong operational fit. | Duplicates test matrix. | Working. Merge with `TEST_MATRIX.md` if redundant. |
| `docs/domain/domain-model.md` | Current object definition source of truth. | Strong but too broad. Includes memberships, vault, property issues, price book, automation. | Duplicates architecture/domain-language and simplification audit. | Canonical input. Rewrite into `docs/canonical/DOMAIN_MODEL.md` with six primary objects. |
| `docs/domain/workflow-model.md` | Status/state model. | Strong but too state-machine-heavy for product canonical workflow. | Duplicates workflow map and workflow-states contract. | Working plus canonical input. Use simple flow in canonical doc; keep detailed lifecycle as working reference. |
| `docs/domain/terminology.md` | Canonical terms, aliases, deprecated terms. | Strong but carries membership-specific and brand-positioning expansions. | Duplicates architecture/domain-language. | Canonical input. Rewrite into smaller `docs/canonical/TERMINOLOGY.md`. |
| `docs/domain/ownership-matrix.md` | Domain ownership by area. | Partial. Useful for implementation, but "Recurring Logic" keeps membership direction alive. | Duplicates domain model and architecture notes. | Working. Remove/park recurring logic content. |
| `docs/domain/audit-2026-05-16.md` | Reconstruction/domain audit. | Diagnostic value; not current law. | Duplicates simplification audit, workflow docs, and dead-route findings. | Generated or Archive. |
| `docs/architecture/property-timeline.md` | Property timeline read model. | Strong. This supports property history moat. | Complements domain model. | Working. Promote key ideas into canonical `DOMAIN_MODEL.md` and `CANONICAL_WORKFLOW.md`. |
| `docs/architecture/booking-request-boundaries.md` | Intake boundary rules. | Strong if framed as lead/intake evidence. | Duplicates domain model booking request section. | Working. |
| `docs/architecture/audit-status-history.md` | Audit/status history alignment. | Strong technical support. | Duplicates workflow-state docs and simplification audit. | Working. |
| `docs/architecture/domain-language.md` | Domain language definitions. | Mixed. Useful definitions but preserves membership and pipeline sections. | Direct duplicate of `docs/domain/terminology.md`. | Archive after merging useful terms into canonical `TERMINOLOGY.md`. |
| `docs/architecture/membership-pricing.md` | Membership pricing field ownership. | Low for current narrowed identity. | Keeps advanced membership/subscription strategy alive. | Archive. |
| `docs/ux/P7_UX_SPEC.md` | Phase 7 UX specification. | Mixed. Likely tied to phase-era dashboard/workflow work. | Duplicates screen map and interaction patterns. | Archive unless it contains active screen requirements for property/visit/estimate flows. |
| `docs/ux/P7_INTERACTION_PATTERNS.md` | Phase 7 interaction patterns. | Mixed. | Duplicates UX spec and screen map. | Archive or Working only for reusable UI patterns. |
| `docs/ux/P7_SCREEN_MAP.md` | Phase 7 screen map. | Mixed. May reinforce dashboard sprawl. | Duplicates UX spec. | Archive unless rewritten around current core screens. |
| `docs/archive/AGENT_SYSTEM.md` | Archived agent system. | Not current product direction. | Duplicates `AGENTS.md`. | Archive. |
| `docs/archive/AI_BOOTSTRAP_PROMPT.md` | Archived AI bootstrap prompt. | Not current product direction. | Duplicates agent execution docs. | Archive. |
| `docs/archive/AI_EXECUTION_PROTOCOL.md` | Archived AI execution protocol. | Not current product direction. | Duplicates `AGENTS.md`. | Archive. |
| `docs/archive/AI_TASK_TEMPLATE.md` | Archived task template. | Not current product direction. | Duplicates agent protocol docs. | Archive. |
| `docs/archive/AGENT_LAUNCH_PACK.md` | Archived launch pack. | Not current product direction. | Duplicates multi-agent docs. | Archive. |
| `docs/archive/CHANGELOG_AI.md` | Archived AI changelog. | Historical only. | Duplicates release manifest. | Archive. |
| `docs/archive/CI_GOVERNANCE.md` | Archived CI governance. | Operational history only. | Duplicates active `docs/CI_GOVERNANCE.md`. | Archive. |
| `docs/archive/MASTER_AUTONOMOUS_DIRECTIVE.md` | Archived autonomous directive. | Not current product direction. | Duplicates AI execution docs. | Archive. |
| `docs/archive/MULTI_AGENT_PROTOCOL.md` | Archived multi-agent protocol. | Not current product direction. | Duplicates AI execution docs. | Archive. |
| `docs/archive/OPERATOR_HANDOFF.md` | Archived handoff. | Historical only. | Duplicates runbook/handoff patterns. | Archive. |
| `docs/archive/PHASE_PLAN.md` | Archived 3-week MVP plan. | Historical only. | Duplicates roadmap. | Archive. |
| `docs/archive/SOURCE_STRENGTHS_MAP.md` | Source repo comparison/mapping. | Historical only. | Not product law. | Archive. |
| `docs/archive/START_PROCESS_NOW.md` | Archived execution kickoff. | Historical only. | Duplicates phase and agent docs. | Archive. |
| `docs/archive/SYSTEM_BLUEPRINT.md` | Archived system blueprint. | Risky if it encodes old platform vision. | Duplicates architecture/product docs. | Archive. |
| `docs/archive/TEAM_ORCHESTRATION.md` | Archived team orchestration. | Not current product direction. | Duplicates agent docs. | Archive. |
| `docs/archive/UX_GAP_REPORT.md` | Archived UX gap report. | Historical diagnosis. | May duplicate current UX docs. | Archive. |
| `docs/archive/WORK_ASSIGNMENT.md` | Archived work assignment. | Historical only. | Duplicates agent docs. | Archive. |
| `docs/archive/conflicts/README.md` | Conflict notes. | Historical support. | None significant. | Archive. |
| `docs/archive/agents/deploy-sre.md` | Archived agent role. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/agents/network-diagnosis.md` | Archived agent role. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/agents/orchestrator.md` | Archived agent role. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/agents/product-engineer.md` | Archived agent role. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/agents/repo-manager.md` | Archived agent role. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/agent-playbooks/architect.md` | Archived agent playbook. | Not product direction. | Duplicates prompts/agents. | Archive. |
| `docs/archive/agent-playbooks/backend-engineer.md` | Archived agent playbook. | Not product direction. | Duplicates prompts/agents. | Archive. |
| `docs/archive/agent-playbooks/db-rls-engineer.md` | Archived agent playbook. | Not product direction. | Duplicates prompts/agents. | Archive. |
| `docs/archive/agent-playbooks/devops-sre.md` | Archived agent playbook. | Not product direction. | Duplicates prompts/agents. | Archive. |
| `docs/archive/agent-playbooks/frontend-engineer.md` | Archived agent playbook. | Not product direction. | Duplicates prompts/agents. | Archive. |
| `docs/archive/agent-playbooks/orchestrator.md` | Archived agent playbook. | Not product direction. | Duplicates prompts/agents. | Archive. |
| `docs/archive/agent-playbooks/product-manager.md` | Archived agent playbook. | Not product direction. | Duplicates prompts/agents. | Archive. |
| `docs/archive/agent-playbooks/qa-engineer.md` | Archived agent playbook. | Not product direction. | Duplicates prompts/agents. | Archive. |
| `docs/archive/agent-playbooks/release-manager.md` | Archived agent playbook. | Not product direction. | Duplicates prompts/agents. | Archive. |
| `docs/archive/agent-playbooks/security-engineer.md` | Archived agent playbook. | Not product direction. | Duplicates prompts/agents. | Archive. |
| `docs/archive/prompts/00_orchestrator_master_prompt.md` | Archived agent prompt. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/prompts/01_product_manager_prompt.md` | Archived agent prompt. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/prompts/02_architect_prompt.md` | Archived agent prompt. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/prompts/03_db_rls_engineer_prompt.md` | Archived agent prompt. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/prompts/04_backend_engineer_prompt.md` | Archived agent prompt. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/prompts/05_frontend_engineer_prompt.md` | Archived agent prompt. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/prompts/06_qa_engineer_prompt.md` | Archived agent prompt. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/prompts/07_devops_sre_prompt.md` | Archived agent prompt. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/prompts/08_security_engineer_prompt.md` | Archived agent prompt. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/prompts/09_release_manager_prompt.md` | Archived agent prompt. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/prompts/10_universal_agent_start_prompt.md` | Archived agent prompt. | Not product direction. | Duplicates agent playbooks. | Archive. |
| `docs/archive/skills/ai-fsm-access-debug.md` | Archived skill. | Operational history only. | Skills may now live outside repo memory. | Archive. |
| `docs/archive/skills/ai-fsm-garonhome-deploy.md` | Archived skill. | Operational history only. | Duplicates deployment runbooks. | Archive. |
| `docs/archive/skills/ai-fsm-git-governance.md` | Archived skill. | Operational history only. | Duplicates CI/governance. | Archive. |
| `docs/archive/skills/ai-fsm-phase-execution.md` | Archived skill. | Not current product direction. | Duplicates old phase process. | Archive. |
| `docs/archive/skills/ai-fsm-release-sync.md` | Archived skill. | Operational history only. | Duplicates release manifest. | Archive. |

## Documents To Move First

Move these out of active instruction paths immediately after canonical docs are created:

- `docs/DOVETAILS_PRODUCT_ALIGNMENT_ROADMAP.md`
- `docs/IMPLEMENTATION_PROMPTS.md`
- `docs/architecture/membership-pricing.md`
- `docs/architecture/domain-language.md`
- `docs/contracts/domain-model-frozen-p0t1.md`
- `docs/ux/P7_UX_SPEC.md`
- `docs/ux/P7_INTERACTION_PATTERNS.md`
- `docs/ux/P7_SCREEN_MAP.md`

## Documents To Merge Or Collapse

- Merge `docs/INCIDENT_RESPONSE.md` into `docs/INCIDENT_RESPONSE_RUNBOOK.md`, then delete or archive the weaker duplicate.
- Merge `docs/DEPLOYMENT_RUNBOOK.md` and `docs/GARONHOME_DEPLOYMENT.md` only if one can remain both concise and operationally exact.
- Merge `docs/contracts/test-strategy.md` and `docs/TEST_MATRIX.md` if they repeat the same test obligations.
- Merge `docs/domain/terminology.md` and `docs/architecture/domain-language.md` into canonical `TERMINOLOGY.md`.
- Merge `docs/WORKFLOW_MAP.md`, `docs/WORKFLOW_CENTERING.md`, and the high-level sections of `docs/domain/workflow-model.md` into canonical `CANONICAL_WORKFLOW.md`.

## Content That Should Not Be Canonical Right Now

- Membership tiers, add-ons, recurring billing cadence, annual/monthly pricing, renewal rules.
- Subscription terminology or subscription architecture.
- Concierge, realtor, routing layers.
- Multi-dashboard strategy.
- Generic FSM platform language.
- Multi-company or SaaS scaling plans.
- AI-first positioning as the product identity.
- Pipeline stage proliferation beyond a derived operational view.

## Content That Should Be Elevated

- Property as the durable service-history center.
- Client plus property as the relationship backbone.
- Estimate guardrails and pricing accuracy.
- Visit execution and completion packets.
- Invoice/payment history.
- Property timeline/read model.
- Booking request as intake evidence, not the product's main object.

## Recommended Next Implementation Pass

1. Add the four folders: `docs/canonical`, `docs/working`, `docs/archive`, `docs/generated`.
2. Create the six canonical docs from the rewrite targets above.
3. Update `README.md`, `CLAUDE.md`, and `AGENTS.md` to reference only those canonical docs for product direction.
4. Move old strategy docs to archive/generated.
5. Run a link check or `rg` pass for references to moved docs.

Do not move docs before the six canonical replacements exist. Otherwise the repo loses useful operating knowledge while the product direction is being cleaned up.
