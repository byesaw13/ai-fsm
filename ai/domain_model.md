# Domain Model: Dovetails FSM

This is the canonical source of truth for all core entity relationships and hierarchical dependencies.

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

## 2. Structural Relationships

### Client & Property
- A **Client** can own or reside at **one or more Properties** (e.g. primary residence and rental properties).
- A **Property** has a **single active Client** association at any given time.

### Property & Work Records
- All **Estimates**, **Jobs**, and **Invoices** are linked directly to a **Property** record, ensuring property history remains continuous even if property ownership changes.

### Job & Visit Execution
- A **Job** represents a contractual agreement and can compile **one or many Visits** (execution events).
- A **Visit** belongs to exactly **one Job** and maps technician schedule times and completed checklist logs.

### Billing & Payments
- A **Job** can yield **one or more Invoices** (e.g. deposit invoice, progress billing, and final invoice).
- An **Invoice** records the billing line items and compiles **zero or more Payments** (transactions).
