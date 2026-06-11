# Database Rules: Dovetails FSM

These rules govern all database migrations, table creation schemas, and data manipulation. They must be strictly followed to prevent schema drift and protect tenant isolation.

## 1. Schema Mandates
Every new table created in PostgreSQL must comply with the following structural rules:

- **UUID Primary Keys**: Primary keys must be UUIDv4 (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`), never auto-incrementing integers.
- **Tenant Isolation**: Every table storing business data must have an `account_id UUID NOT NULL` column referencing the tenant account.
- **Auditing Timestamps**: Every table must contain `created_at` and `updated_at` timestamptz columns:
  - `created_at TIMESTAMPTZ DEFAULT now() NOT NULL`
  - `updated_at TIMESTAMPTZ DEFAULT now() NOT NULL`
- **Request Traceability**: State-changing event tables, audit logs, and transaction tables must include a nullable `trace_id UUID` column to correlate database writes to HTTP request flows.

## 2. Row-Level Security (RLS)
- **RLS Enforced**: Row-Level Security must be enabled and forced on **every** table.
- **RLS Policies**: Standard tenant isolation policies should be declared to utilize the existing `app_account_id()` security helper:
  ```sql
  ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
  ALTER TABLE <table_name> FORCE ROW LEVEL SECURITY;
  
  CREATE POLICY <table_name>_select ON <table_name> FOR SELECT USING (account_id = app_account_id());
  CREATE POLICY <table_name>_insert ON <table_name> FOR INSERT WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  CREATE POLICY <table_name>_update ON <table_name> FOR UPDATE USING (account_id = app_account_id() AND is_owner_or_admin());
  CREATE POLICY <table_name>_delete ON <table_name> FOR DELETE USING (account_id = app_account_id() AND is_owner_or_admin());
  ```

## 3. Migration Integrity
- All migrations must be written as raw, additive SQL scripts under `db/migrations`.
- Use idempotent constructs (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.) where possible.
- When adding new columns, ensure they are nullable or have defaults to avoid breaking existing data states.
