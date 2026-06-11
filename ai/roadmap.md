# Product Roadmap: Dovetails FSM

## 1. Core Priority
The current roadmap priority is to solidify and simplify the standard residential handyman pipeline:
```text
Client -> Property -> Estimate -> Job -> Visit -> Invoice -> Property History
```

## 2. Active Development Phases

### Phase 1: Documentation & Governance Canonicalization
- **Status**: In progress
- **Deliverables**:
  - Define authoritative canonical model in `docs/canonical/`.
  - Establish static `/ai` memory directory for agents.
  - Purge redundant/outdated planning and strategy stubs.

### Phase 2: Property-Centered Workflow
- **Status**: Next
- **Deliverables**:
  - Expose Property timeline across all entities (Client, Job, Visit, Invoice).
  - Materialize completed visit evidence directly on the Property record.
  - Auto-promote field observations (e.g. technician notes) to Property timeline.

### Phase 3: Estimate & Execution Clarity
- **Status**: Next
- **Deliverables**:
  - Estimate versioning and revision history.
  - Room-by-room Estimate templates.
  - Sequential, account-scoped Job numbering.
  - Visit checklist completion packets.
  - Field technician photo uploads.

### Phase 4: Billing & Timeline Closure
- **Status**: Planned
- **Deliverables**:
  - Auto-generate Invoices directly from completed Visits.
  - Integrate Payment transaction history with the Property timeline.
  - Simplify dashboard to show only derived operational views.

---

## 3. Strict Out-of-Scope Limits
The following areas are **frozen** and must not be worked on or refactored:
- Multi-company or SaaS scaling features (Dovetails is single-business scoped).
- Subscription billing models.
- Realtor-specific routing algorithms.
- Complex membership structures.
- Custom dashboard suites.
