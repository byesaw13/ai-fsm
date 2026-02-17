# Domain Model Contract (FROZEN)

> Status: **FROZEN** as of 2026-02-16 — P0-T1
> Any changes require ADR entry in `docs/DECISION_LOG.md` and orchestrator approval.

## Source Evidence

- **Myprogram**: `DOMAIN_MODEL.md`, `supabase/migrations/001_core_schema.sql`, `supabase/migrations/002_rls_policies.sql`, `supabase/migrations/003_workflow_invariants.sql`
- **Dovelite**: `db/001_initial_schema.sql`, `db/002_rls_policies.sql`
- **Adopted from Myprogram**: Entity structure, money-in-cents pattern, membership-based RBAC, status enum constraints, workflow invariant enforcement at DB layer, audit logging trigger pattern
- **Adopted from Dovelite**: Practical visit workflow (scheduled → arrived → in_progress → completed), account-scoped RLS helper functions, `updated_at` trigger pattern
- **Intentional divergences**: ai-fsm uses `users` table with `password_hash` (no Supabase auth dependency); roles embedded in `users.role` instead of separate `memberships` junction table (simpler for MVP); `properties` added as first-class entity (from Myprogram) where Dovelite uses `homes`

## Entities

### accounts
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default `gen_random_uuid()` |
| name | TEXT | NOT NULL |
| settings | JSONB | NOT NULL, default `'{}'` |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` |

### users
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default `gen_random_uuid()` |
| account_id | UUID | NOT NULL, FK → accounts(id) ON DELETE CASCADE |
| email | TEXT | NOT NULL |
| full_name | TEXT | NOT NULL |
| phone | TEXT | |
| password_hash | TEXT | NOT NULL |
| role | TEXT | NOT NULL, CHECK `('owner','admin','tech')` |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| UNIQUE | | (account_id, email) |

### clients
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| account_id | UUID | NOT NULL, FK → accounts ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| email | TEXT | |
| phone | TEXT | |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` |

### properties
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| account_id | UUID | NOT NULL, FK → accounts ON DELETE CASCADE |
| client_id | UUID | NOT NULL, FK → clients(id) ON DELETE CASCADE |
| name | TEXT | |
| address | TEXT | NOT NULL |
| city | TEXT | |
| state | TEXT | |
| zip | TEXT | |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` |

### jobs
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| account_id | UUID | NOT NULL, FK → accounts ON DELETE CASCADE |
| client_id | UUID | NOT NULL, FK → clients(id) ON DELETE RESTRICT |
| property_id | UUID | FK → properties(id) ON DELETE SET NULL |
| title | TEXT | NOT NULL |
| description | TEXT | |
| status | TEXT | NOT NULL, default `'draft'`, CHECK `('draft','quoted','scheduled','in_progress','completed','invoiced')` |
| priority | INTEGER | NOT NULL, default `0` |
| scheduled_start | TIMESTAMPTZ | |
| scheduled_end | TIMESTAMPTZ | |
| created_by | UUID | NOT NULL, FK → users(id) |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` |

**Indexes**: `(account_id, status)`, `(account_id, scheduled_start)`, `(client_id)`

### visits
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| account_id | UUID | NOT NULL, FK → accounts ON DELETE CASCADE |
| job_id | UUID | NOT NULL, FK → jobs(id) ON DELETE CASCADE |
| assigned_user_id | UUID | FK → users(id) ON DELETE SET NULL |
| status | TEXT | NOT NULL, default `'scheduled'`, CHECK `('scheduled','arrived','in_progress','completed','cancelled')` |
| scheduled_start | TIMESTAMPTZ | NOT NULL |
| scheduled_end | TIMESTAMPTZ | NOT NULL |
| arrived_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| tech_notes | TEXT | |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` |

**Indexes**: `(account_id, status)`, `(account_id, scheduled_start)`, `(job_id)`

### estimates
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| account_id | UUID | NOT NULL, FK → accounts ON DELETE CASCADE |
| client_id | UUID | NOT NULL, FK → clients(id) ON DELETE RESTRICT |
| job_id | UUID | FK → jobs(id) ON DELETE SET NULL |
| property_id | UUID | FK → properties(id) ON DELETE SET NULL |
| status | TEXT | NOT NULL, default `'draft'`, CHECK `('draft','sent','approved','declined','expired')` |
| subtotal_cents | INTEGER | NOT NULL, default `0`, CHECK `>= 0` |
| tax_cents | INTEGER | NOT NULL, default `0`, CHECK `>= 0` |
| total_cents | INTEGER | NOT NULL, default `0`, CHECK `>= 0` |
| notes | TEXT | |
| internal_notes | TEXT | |
| sent_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | |
| created_by | UUID | NOT NULL, FK → users(id) |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` |

**Indexes**: `(account_id, status)`, `(client_id)`, `(job_id)`

### estimate_line_items
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| estimate_id | UUID | NOT NULL, FK → estimates(id) ON DELETE CASCADE |
| description | TEXT | NOT NULL |
| quantity | NUMERIC(10,2) | NOT NULL, CHECK `> 0` |
| unit_price_cents | INTEGER | NOT NULL, CHECK `>= 0` |
| total_cents | INTEGER | NOT NULL, CHECK `>= 0` |
| sort_order | INTEGER | NOT NULL, default `0` |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |

### invoices
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| account_id | UUID | NOT NULL, FK → accounts ON DELETE CASCADE |
| client_id | UUID | NOT NULL, FK → clients(id) ON DELETE RESTRICT |
| job_id | UUID | FK → jobs(id) ON DELETE SET NULL |
| estimate_id | UUID | FK → estimates(id) ON DELETE SET NULL |
| property_id | UUID | FK → properties(id) ON DELETE SET NULL |
| status | TEXT | NOT NULL, default `'draft'`, CHECK `('draft','sent','partial','paid','overdue','void')` |
| invoice_number | TEXT | NOT NULL |
| subtotal_cents | INTEGER | NOT NULL, default `0`, CHECK `>= 0` |
| tax_cents | INTEGER | NOT NULL, default `0`, CHECK `>= 0` |
| total_cents | INTEGER | NOT NULL, default `0`, CHECK `>= 0` |
| paid_cents | INTEGER | NOT NULL, default `0`, CHECK `>= 0` |
| notes | TEXT | |
| due_date | TIMESTAMPTZ | |
| sent_at | TIMESTAMPTZ | |
| paid_at | TIMESTAMPTZ | |
| created_by | UUID | NOT NULL, FK → users(id) |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| UNIQUE | | (account_id, invoice_number) |

**Indexes**: `(account_id, status)`, `(account_id, invoice_number)`, `(client_id)`, `(job_id)`

### invoice_line_items
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| invoice_id | UUID | NOT NULL, FK → invoices(id) ON DELETE CASCADE |
| estimate_line_item_id | UUID | FK → estimate_line_items(id) ON DELETE SET NULL |
| description | TEXT | NOT NULL |
| quantity | NUMERIC(10,2) | NOT NULL, CHECK `> 0` |
| unit_price_cents | INTEGER | NOT NULL, CHECK `>= 0` |
| total_cents | INTEGER | NOT NULL, CHECK `>= 0` |
| sort_order | INTEGER | NOT NULL, default `0` |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |

### payments
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| account_id | UUID | NOT NULL, FK → accounts ON DELETE CASCADE |
| invoice_id | UUID | NOT NULL, FK → invoices(id) ON DELETE CASCADE |
| amount_cents | INTEGER | NOT NULL, CHECK `> 0` |
| method | TEXT | NOT NULL |
| received_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| notes | TEXT | |
| created_by | UUID | NOT NULL, FK → users(id) |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |

**Indexes**: `(account_id)`, `(invoice_id)`

### automations
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| account_id | UUID | NOT NULL, FK → accounts ON DELETE CASCADE |
| type | TEXT | NOT NULL, CHECK `('visit_reminder','invoice_followup')` |
| enabled | BOOLEAN | NOT NULL, default `true` |
| config | JSONB | NOT NULL, default `'{}'` |
| next_run_at | TIMESTAMPTZ | NOT NULL |
| last_run_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, default `now()` |

**Index**: `(enabled, next_run_at)`

### audit_log
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| account_id | UUID | NOT NULL, FK → accounts ON DELETE CASCADE |
| entity_type | TEXT | NOT NULL |
| entity_id | UUID | NOT NULL |
| action | TEXT | NOT NULL, CHECK `('insert','update','delete')` |
| actor_id | UUID | NOT NULL |
| old_value | JSONB | |
| new_value | JSONB | |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |

**Indexes**: `(account_id, entity_type, entity_id)`, `(account_id, created_at)`

## Entity Relationships

```
accounts 1──* users
accounts 1──* clients
accounts 1──* automations
accounts 1──* audit_log

clients 1──* properties
clients 1──* jobs (RESTRICT delete)
clients 1──* estimates (RESTRICT delete)
clients 1──* invoices (RESTRICT delete)

properties ?──* jobs (SET NULL on delete)
properties ?──* estimates (SET NULL on delete)
properties ?──* invoices (SET NULL on delete)

jobs 1──* visits (CASCADE delete)
jobs ?──* estimates (SET NULL on delete)
jobs ?──* invoices (SET NULL on delete)

estimates 1──* estimate_line_items (CASCADE delete)
estimates ?──* invoices (SET NULL on delete)

invoices 1──* invoice_line_items (CASCADE delete)
invoices 1──* payments (CASCADE delete)

users --< visits.assigned_user_id (SET NULL on delete)
users --< jobs.created_by
users --< estimates.created_by
users --< invoices.created_by
users --< payments.created_by
```

## Tenant Isolation Rule

Every table except `accounts` itself carries `account_id`. All queries MUST scope by `account_id`. RLS policies enforce this at the database layer.

## Money Convention

All monetary values stored as **integer cents** (`_cents` suffix). Conversion to display currency happens in the frontend only.

## Timestamp Convention

- All entities have `created_at` (immutable).
- Mutable entities have `updated_at` (auto-set via trigger).
- Financial timestamps: `sent_at`, `paid_at`, `received_at`, `expires_at`, `due_date`.

## Immutability Rules (from Myprogram `003_workflow_invariants.sql`)

- **Estimates**: Only `draft` status allows full edits. `sent` allows only `internal_notes`. `approved`/`declined`/`expired` are immutable.
- **Invoices**: Only `draft` allows full edits. `sent` allows only `paid_cents` updates (via payment recording). `paid`/`overdue`/`void` are immutable except payment linkage.
- **Estimate → Invoice conversion**: Creates an immutable snapshot — line items are copied, not referenced.
