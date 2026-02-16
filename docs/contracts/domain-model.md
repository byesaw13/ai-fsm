# Domain Model Contract

## Entities
- account
- user
- client
- property
- job
- visit
- estimate
- estimate_line_item
- invoice
- invoice_line_item
- payment
- automation
- audit_log

## Tenant Rule
All business entities must include `account_id` and be protected by RLS policies.
