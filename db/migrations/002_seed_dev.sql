insert into accounts (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Demo Account')
on conflict do nothing;

insert into users (id, account_id, email, password_hash, role)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'owner@example.com', 'replace_with_bcrypt_hash', 'owner'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'tech@example.com', 'replace_with_bcrypt_hash', 'tech')
on conflict do nothing;
