# PRODUCT CONTRACT

## Product Outcome
A production-ready FSM app used daily by a small service company, optimized for low-cost self-hosting and Pi4 target runtime.

## Core Personas
1. Owner/Admin: dispatch, quoting, invoicing, reporting
2. Tech: assigned visits, status updates, visit notes
3. Office/Admin: estimate/invoice/payment processing

## Canonical Workflows
1. Lead/client -> job
2. Job -> scheduled visit(s)
3. Job/visit -> estimate
4. Approved estimate -> invoice
5. Invoice -> manual payment -> paid/partial status
6. Automations trigger reminders/follow-ups

## Acceptance Criteria By Module
### Auth/RBAC
- Role-protected routes
- Password hashing and secure sessions

### Jobs/Visits
- Full CRUD, lifecycle transitions, tech assignment
- Visit completion with notes and timestamps

### Estimates/Invoices
- Draft/send/approve for estimates
- Convert estimate to invoice
- Manual payment recording updates invoice status

### Automations
- Visit reminder scheduling rule
- Overdue invoice follow-up rule
- Retry-safe worker execution

### Data Security
- RLS enabled and tested against cross-tenant access
- Audit log for sensitive mutations

### Ops
- Backup and restore tested
- Pi4 deployment tested with ARM64 images
