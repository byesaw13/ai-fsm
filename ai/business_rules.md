# Business Rules: Dovetails FSM

## 1. Domain Entities & Invariants
All developers and AI agents must adhere to the core status contracts and entity relationships:

- **Client**: A customer household.
  - Owns contact details, communications preferences, and portal access.
  - Does NOT own property history (that stays with the home), scheduling truth, or billing balances.
- **Property**: The physical home. This is the **durable source of truth** for the system.
  - Owns the timeline history, address, observations, and equipment lists.
  - All visits, invoices, and estimates are linked to the property record.
- **Estimate**: A priced proposal.
  - Can contain multiple options and is subjected to margin/complexity guardrails.
  - Transitions through: `draft` $\rightarrow$ `sent` $\rightarrow$ `approved` / `declined` / `expired`.
- **Job**: The active thread of work accepted by the client.
  - Links approved estimates, visits, invoices, and project expenses.
  - Does NOT own scheduling truth (visits do).
- **Visit**: Scheduled technician execution event.
  - Owns scheduled times, technician assignment, field status, completion packets, and site logs.
  - Does NOT own pricing or billing state.
- **Invoice**: Financial collection record.
  - Owns totals, billing line items, and payment state.
  - Transitions through: `draft` $\rightarrow$ `sent` $\rightarrow$ `paid` / `overdue` / `void`.

## 2. Naming Constraints
- Do not introduce new durable entity tables or concepts without explicitly updating the canonical Domain Model.
- Avoid synonyms (e.g., use `property` instead of `home` or `site`, `client` instead of `customer` or `user`).

## 3. Workflow Constraints
- **Intake Is Temporary**: A booking request or lead is intake evidence, NOT a work object. A client, property, or job is only created when the request is qualified and accepted.
- **Explicit Transitions**: Never use generic PATCH endpoints for status changes. Use explicit workflow API routes (e.g., `POST /api/v1/jobs/[id]/transition`) to ensure side-effects (logging status history, dispatching notifications) execute.
- **Derived Views Only**: Pipelines, command centers, and dashboards must be computed/derived views from active records, never stored as parallel workflow objects.
