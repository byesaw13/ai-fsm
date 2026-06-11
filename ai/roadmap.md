# Product Roadmap Summary

> [!IMPORTANT]
> **Authoritative Source**: [docs/canonical/ROADMAP.md](file:///home/nick/ai-fsm-deploy-clean/docs/canonical/ROADMAP.md). If conflicts exist, the canonical document always wins.

This is a distilled summary of the development phases for AI tools.

## 1. Active Phases & Deliverables

- **Phase 1: Documentation & Governance Canonicalization** (Status: In progress)
  - Define authoritative canonical model in `docs/canonical/`.
  - Establish static `/ai` memory directory for agents.
  - Purge redundant/outdated planning and strategy stubs.
- **Phase 2: Property-Centered Workflow** (Status: Next)
  - Expose Property timeline across all entities (Client, Job, Visit, Invoice).
  - Materialize completed visit evidence directly on the Property record.
  - Auto-promote field observations (e.g. technician notes) to Property timeline.
- **Phase 3: Estimate & Execution Clarity** (Status: Next)
  - Estimate versioning and revision history.
  - Room-by-room Estimate templates.
  - Sequential, account-scoped Job numbering.
  - Visit checklist completion packets.
  - Field technician photo uploads.
- **Phase 4: Billing & Timeline Closure** (Status: Planned)
  - Auto-generate Invoices directly from completed Visits.
  - Integrate Payment transaction history with the Property timeline.
  - Simplify dashboard to show only derived operational views.

---

## 2. Core Exclusions
The following areas are **strictly out-of-scope** and frozen:
- Multi-company or SaaS scaling features (Dovetails is single-business scoped).
- Subscription billing models.
- Realtor-specific routing algorithms.
- Complex membership structures.
- Custom dashboard suites.
