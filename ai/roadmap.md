# Product Roadmap: Dovetails FSM

## 1. Core Priority
The current roadmap priority is to solidify and simplify the standard residential handyman pipeline:
```text
Client -> Property -> Estimate -> Job -> Visit -> Invoice -> Property History
```

## 2. Active Development Phases

### Phase 1: Documentation & Governance Canonicalization
- **Status**: Completed / Maintained.
- **Goals**: Create single authoritative definitions of domain, architecture, and database logic. Purge stale/deprecated workspace files.

### Phase 2: Property-Centered Workflow
- **Status**: In Progress / Active.
- **Goals**: Make property timeline history accessible across client, job, visit, estimate, and invoice views. Ensure completion records, technician logs, and photos materialize directly on the property record.

### Phase 3: Estimate & Execution Clarity
- **Status**: Next.
- **Goals**: Keep estimate guardrails enforceable. Make the handoff from approved estimate to job readiness explicit. Focus visit execution interface on notes, materials, media, and completion packets.

### Phase 4: Billing & Timeline Closure
- **Status**: Planned.
- **Goals**: Link invoice creation directly to completed visit records. Make payment history visible on the property timeline.

---

## 3. Strict Out-of-Scope Limits
The following areas are **frozen** and must not be worked on or refactored:
- Multi-company or SaaS scaling features (Dovetails is single-business scoped).
- Subscription billing models.
- Realtor-specific routing algorithms.
- Complex membership structures.
- Custom dashboard suites.
