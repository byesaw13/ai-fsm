-- Account A (primary test account)
insert into accounts (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Demo Account')
on conflict do nothing;

-- Account B (cross-tenant isolation testing)
insert into accounts (id, name)
values ('22222222-2222-2222-2222-222222222222', 'Other Account')
on conflict do nothing;

-- Account A users
insert into users (id, account_id, email, full_name, password_hash, role)
values
  ('11111111-1111-1111-1111-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner@test.com', 'Test Owner', 'replace_with_bcrypt_hash', 'owner'),
  ('11111111-1111-1111-1111-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'admin@test.com', 'Test Admin', 'replace_with_bcrypt_hash', 'admin'),
  ('11111111-1111-1111-1111-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'tech@test.com', 'Test Tech', 'replace_with_bcrypt_hash', 'tech')
on conflict do nothing;

-- Account B user (for RLS abuse tests)
insert into users (id, account_id, email, full_name, password_hash, role)
values
  ('22222222-2222-2222-2222-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'owner-b@test.com', 'Other Owner', 'replace_with_bcrypt_hash', 'owner')
on conflict do nothing;
