# Domain Model Summary

> [!IMPORTANT]
> **Authoritative Source**: [docs/canonical/DOMAIN_MODEL.md](file:///home/nick/ai-fsm-deploy-clean/docs/canonical/DOMAIN_MODEL.md). If conflicts exist, the canonical document always wins.

This is a distilled summary of the entity relationships for AI tools.

## 1. Entity Hierarchy & Cardinality
```text
Lead (Booking Request)
  └── Client (1)
        └── Property (1..*)
              ├── Estimates (0..*)
              └── Jobs (0..*)
                    ├── Visits (1..*)
                    │     ├── Notes (0..*)
                    │     ├── Materials (0..*)
                    │     └── Media/Photos (0..*)
                    └── Invoices (0..*)
                          └── Payments (0..*)
```

## 2. Core Reminders & Constraints
- **Property is the Core Asset**: All estimates, jobs, invoices, notes, and photos are linked directly to the property. History stays with the physical home.
- **Client owns identity**: Contact details, communication preferences, and portal access. Client does NOT own timeline history or billing balances.
- **Jobs own work execution**: Represents the contract that binds estimates, visits, invoices, and expenses together.
- **Visits own scheduling**: Owns scheduled times, assignments, site logs, checklists, and completion packets. Does NOT own pricing/invoicing.
- **Invoices own billing**: Records total amounts, line items, and transaction payments.
