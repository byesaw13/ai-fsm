-- Account A (primary test account)
insert into accounts (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Demo Account')
on conflict do nothing;

-- Account B (cross-tenant isolation testing)
insert into accounts (id, name)
values ('22222222-2222-2222-2222-222222222222', 'Other Account')
on conflict do nothing;

-- Account A users
-- Password for all: 'password' (bcrypt hash: $2b$10$1ficvwl3W6YEDiRk.ZPaPOX2YbkrutJKoDbhPpu9.nM6B1C1qU3Fm)
insert into users (id, account_id, email, full_name, password_hash, role)
values
  ('11111111-1111-1111-1111-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner@test.com', 'Test Owner', '$2b$10$1ficvwl3W6YEDiRk.ZPaPOX2YbkrutJKoDbhPpu9.nM6B1C1qU3Fm', 'owner'),
  ('11111111-1111-1111-1111-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'admin@test.com', 'Test Admin', '$2b$10$1ficvwl3W6YEDiRk.ZPaPOX2YbkrutJKoDbhPpu9.nM6B1C1qU3Fm', 'admin'),
  ('11111111-1111-1111-1111-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'tech@test.com', 'Test Tech', '$2b$10$1ficvwl3W6YEDiRk.ZPaPOX2YbkrutJKoDbhPpu9.nM6B1C1qU3Fm', 'tech')
on conflict do nothing;

-- Account B user (for RLS abuse tests)
insert into users (id, account_id, email, full_name, password_hash, role)
values
  ('22222222-2222-2222-2222-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'owner-b@test.com', 'Other Owner', '$2b$10$1ficvwl3W6YEDiRk.ZPaPOX2YbkrutJKoDbhPpu9.nM6B1C1qU3Fm', 'owner')
on conflict do nothing;
