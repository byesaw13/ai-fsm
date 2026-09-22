-- Demo fixture: a job that exercises the estimated-vs-actual labor headline on the
-- job detail page (Internal P&L). Dev/QA/demo only — applied by `pnpm db:seed`,
-- NOT by db-migrate.sh (skips *seed*) and NOT by production deploy. Never real data.
-- Backlog: docs/backlog/TASK-151-per-person-labor-actuals.md.
--
-- Shape: an approved estimate with $300 internal labor cost + 7h of job_work by a
-- DEDICATED demo worker whose cost rate is pinned to $50/hr (burden 1.0), so the
-- actual is a deterministic $350 → "▲ +$50.00 over" regardless of the mutable
-- Test Owner rate. Attaches to the 002_seed_dev.sql test account (run after it).
-- Idempotent (ON CONFLICT DO NOTHING) so re-seeding is a no-op.

-- Dedicated worker with a pinned cost rate — the fixture's deterministic costing
-- input (password hash matches 002_seed_dev.sql: login 'password').
INSERT INTO users (id, account_id, email, full_name, password_hash, role,
                   cost_cents_per_hour, burden_multiplier)
VALUES ('dededede-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'demo-tech@test.com', 'Demo Tech',
        '$2b$10$1ficvwl3W6YEDiRk.ZPaPOX2YbkrutJKoDbhPpu9.nM6B1C1qU3Fm', 'tech',
        5000, 1.0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clients (id, account_id, name)
VALUES ('c1000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'Demo — Riverside Kitchen')
ON CONFLICT (id) DO NOTHING;

INSERT INTO jobs (id, account_id, client_id, title, created_by)
VALUES ('10b00000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'c1000000-0000-0000-0000-000000000001',
        'Kitchen cabinet refinish',
        '11111111-1111-1111-1111-aaaaaaaaaaaa')
ON CONFLICT (id) DO NOTHING;

INSERT INTO estimates (id, account_id, client_id, created_by, job_id,
                       status, total_cents, internal_labor_cost_cents)
VALUES ('e5000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'c1000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-aaaaaaaaaaaa',
        '10b00000-0000-0000-0000-000000000001',
        'approved', 100000, 30000)
ON CONFLICT (id) DO NOTHING;

-- 7h of the pinned demo worker's job_work (ends "now" so it reads as recent).
INSERT INTO activity_entries (id, account_id, user_id, activity_type, category,
                              started_at, ended_at, entity_type, entity_id,
                              source, labor_bucket)
VALUES ('ac000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'dededede-0000-0000-0000-000000000001',
        'job_work', 'revenue',
        now() - interval '7 hours', now(),
        'job', '10b00000-0000-0000-0000-000000000001',
        'manual', 'billable')
ON CONFLICT (id) DO NOTHING;
