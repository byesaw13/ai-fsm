create extension if not exists "pgcrypto";

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  email text not null,
  password_hash text not null,
  role text not null check (role in ('owner', 'admin', 'tech')),
  created_at timestamptz not null default now(),
  unique (account_id, email)
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','quoted','scheduled','in_progress','completed','invoiced')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  assigned_user_id uuid references users(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','arrived','in_progress','completed','cancelled')),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists estimates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  job_id uuid references jobs(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sent','approved','declined','expired')),
  subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  tax_cents int not null default 0 check (tax_cents >= 0),
  total_cents int not null default 0 check (total_cents >= 0),
  created_at timestamptz not null default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  job_id uuid references jobs(id) on delete set null,
  estimate_id uuid references estimates(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sent','partial','paid','overdue','void')),
  invoice_number text not null,
  subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  tax_cents int not null default 0 check (tax_cents >= 0),
  total_cents int not null default 0 check (total_cents >= 0),
  paid_cents int not null default 0 check (paid_cents >= 0),
  due_date timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, invoice_number)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  method text not null,
  recorded_at timestamptz not null default now(),
  notes text
);

create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  type text not null check (type in ('visit_reminder','invoice_followup')),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  next_run_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_jobs_account_status on jobs(account_id, status);
create index if not exists idx_visits_account_start on visits(account_id, scheduled_start);
create index if not exists idx_estimates_account_status on estimates(account_id, status);
create index if not exists idx_invoices_account_status on invoices(account_id, status);
create index if not exists idx_automations_due on automations(enabled, next_run_at);
