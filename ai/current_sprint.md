# Current Strategic Focus: Dovetails FSM

This document details the active strategic objectives for developers and AI agents. Operational bugs and hotfixes belong in the changelog (`docs/changelog.md`), not here.

## Active Strategic Focus Areas

### 1. Property-Centered Workflow
- **Goal**: Establish the property timeline as the central hub of truth.
- **Priority**: High.
- **Focus**: Integrating observation feeds, equipment records, and technician notes directly onto the Property view.

### 2. Chronological Job Numbering
- **Goal**: Implement clean, sequential, and account-scoped job numbers (e.g. Job #1001).
- **Priority**: Medium.
- **Focus**: Generating deterministic job IDs upon estimate approval, keeping them visible in technicians' schedules and invoices.

### 3. AI Estimate Generation
- **Goal**: Standardize the estimate builder interface using structured price book options.
- **Priority**: Medium.
- **Focus**: Supporting room-based scope configurations and ensuring estimate-level pricing guardrails are strictly checked before sending.

### 4. Property Timeline View
- **Goal**: Optimize the performance and presentation of property history.
- **Priority**: Low.
- **Focus**: Creating derived read-model timeline aggregations that summarize client interactions, previous repairs, and equipment servicing.

### 5. Invoice Workflow
- **Goal**: Ensure seamless transition from visit completion to invoice collection.
- **Priority**: Low.
- **Focus**: Mapping visit line items (labor plus materials) automatically to invoice draft records.
