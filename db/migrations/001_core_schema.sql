create extension if not exists "pgcrypto";

-- === updated_at trigger function ===
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- === accounts ===
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_accounts_updated_at before update on accounts
  for each row execute function update_updated_at_column();

-- === users ===
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  password_hash text not null,
  role text not null check (role in ('owner', 'admin', 'tech')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, email)
);
create trigger trg_users_updated_at before update on users
  for each row execute function update_updated_at_column();

-- === clients ===
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_clients_updated_at before update on clients
  for each row execute function update_updated_at_column();

-- === properties ===
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  name text,
  address text not null,
  city text,
  state text,
  zip text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_properties_updated_at before update on properties
  for each row execute function update_updated_at_column();

-- === jobs ===
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  property_id uuid references properties(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','quoted','scheduled','in_progress','completed','invoiced','cancelled')),
  priority integer not null default 0,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_jobs_updated_at before update on jobs
  for each row execute function update_updated_at_column();

-- === visits ===
create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  assigned_user_id uuid references users(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','arrived','in_progress','completed','cancelled')),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  arrived_at timestamptz,
  completed_at timestamptz,
  tech_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_visits_updated_at before update on visits
  for each row execute function update_updated_at_column();

-- === estimates ===
create table if not exists estimates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  job_id uuid references jobs(id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sent','approved','declined','expired')),
  subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  tax_cents int not null default 0 check (tax_cents >= 0),
  total_cents int not null default 0 check (total_cents >= 0),
  notes text,
  internal_notes text,
  sent_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_estimates_updated_at before update on estimates
  for each row execute function update_updated_at_column();

-- === estimate_line_items ===
create table if not exists estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) not null check (quantity > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  total_cents int not null check (total_cents >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- === invoices ===
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  job_id uuid references jobs(id) on delete set null,
  estimate_id uuid references estimates(id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sent','partial','paid','overdue','void')),
  invoice_number text not null,
  subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  tax_cents int not null default 0 check (tax_cents >= 0),
  total_cents int not null default 0 check (total_cents >= 0),
  paid_cents int not null default 0 check (paid_cents >= 0),
  notes text,
  due_date timestamptz,
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, invoice_number)
);
create trigger trg_invoices_updated_at before update on invoices
  for each row execute function update_updated_at_column();

-- === invoice_line_items ===
create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  estimate_line_item_id uuid references estimate_line_items(id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null check (quantity > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  total_cents int not null check (total_cents >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- === payments ===
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  method text not null,
  received_at timestamptz not null default now(),
  notes text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- === automations ===
create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  type text not null check (type in ('visit_reminder','invoice_followup')),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_automations_updated_at before update on automations
  for each row execute function update_updated_at_column();

-- === audit_log ===
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  actor_id uuid not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

-- === indexes ===
create index if not exists idx_users_account on users(account_id);
create index if not exists idx_clients_account on clients(account_id);
create index if not exists idx_properties_account on properties(account_id);
create index if not exists idx_properties_client on properties(client_id);
create index if not exists idx_jobs_account_status on jobs(account_id, status);
create index if not exists idx_jobs_account_scheduled on jobs(account_id, scheduled_start);
create index if not exists idx_jobs_client on jobs(client_id);
create index if not exists idx_visits_account_status on visits(account_id, status);
create index if not exists idx_visits_account_start on visits(account_id, scheduled_start);
create index if not exists idx_visits_job on visits(job_id);
create index if not exists idx_estimates_account_status on estimates(account_id, status);
create index if not exists idx_estimates_client on estimates(client_id);
create index if not exists idx_estimates_job on estimates(job_id);
create index if not exists idx_estimate_line_items_estimate on estimate_line_items(estimate_id);
create index if not exists idx_invoices_account_status on invoices(account_id, status);
create index if not exists idx_invoices_account_number on invoices(account_id, invoice_number);
create index if not exists idx_invoices_client on invoices(client_id);
create index if not exists idx_invoices_job on invoices(job_id);
create index if not exists idx_invoice_line_items_invoice on invoice_line_items(invoice_id);
create index if not exists idx_payments_account on payments(account_id);
create index if not exists idx_payments_invoice on payments(invoice_id);
create index if not exists idx_automations_due on automations(enabled, next_run_at);
create index if not exists idx_audit_log_entity on audit_log(account_id, entity_type, entity_id);
create index if not exists idx_audit_log_created on audit_log(account_id, created_at);
