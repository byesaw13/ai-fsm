-- Migration 045: Plan templates and add-on catalog
--
-- Separates the concept of "what a plan IS" (template) from
-- "a client's enrollment" (existing maintenance_plans rows).
-- Add-ons are flat annual line items attached to a subscription.

-- -------------------------------------------------------------------------
-- Plan templates — reusable catalog entries defined by the business
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_templates (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                            TEXT NOT NULL,
  tier                            TEXT NOT NULL CHECK (tier IN ('essential', 'plus', 'premier')),
  description                     TEXT,
  visit_count_per_year            INT NOT NULL DEFAULT 2 CHECK (visit_count_per_year > 0),
  included_labor_minutes_per_visit INT NOT NULL DEFAULT 60 CHECK (included_labor_minutes_per_visit >= 0),
  base_price_cents                INT NOT NULL DEFAULT 0 CHECK (base_price_cents >= 0),
  included_features               TEXT[] NOT NULL DEFAULT '{}',
  is_active                       BOOL NOT NULL DEFAULT true,
  sort_order                      INT NOT NULL DEFAULT 0,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_templates_account_idx
  ON plan_templates(account_id)
  WHERE is_active = true;

-- -------------------------------------------------------------------------
-- Add-on catalog — a la carte annual line items
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_addons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  annual_price_cents INT NOT NULL DEFAULT 0 CHECK (annual_price_cents >= 0),
  is_active         BOOL NOT NULL DEFAULT true,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_addons_account_idx
  ON plan_addons(account_id);

-- -------------------------------------------------------------------------
-- Subscription add-ons — which add-ons a client subscription includes
-- Price is snapshotted at enrollment so catalog changes don't affect
-- existing subscriptions.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_addons (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL,
  subscription_id    UUID NOT NULL REFERENCES maintenance_plans(id) ON DELETE CASCADE,
  addon_id           UUID NOT NULL REFERENCES plan_addons(id) ON DELETE RESTRICT,
  annual_price_cents INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, addon_id)
);

CREATE INDEX IF NOT EXISTS subscription_addons_subscription_idx
  ON subscription_addons(subscription_id);

-- -------------------------------------------------------------------------
-- Link subscriptions to templates
-- -------------------------------------------------------------------------
ALTER TABLE maintenance_plans
  ADD COLUMN IF NOT EXISTS plan_template_id UUID REFERENCES plan_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maintenance_plans_template_idx
  ON maintenance_plans(plan_template_id)
  WHERE plan_template_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- Seed 3 template stubs for existing account(s)
-- Values are placeholders — admin fills in real prices/caps via the UI.
-- Existing subscriptions are linked to the matching tier template.
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_account_id UUID;
  t_essential  UUID;
  t_plus       UUID;
  t_premier    UUID;
BEGIN
  -- Only seed for accounts that already have maintenance_plans
  FOR v_account_id IN
    SELECT DISTINCT account_id FROM maintenance_plans
  LOOP
    -- Skip if templates already exist for this account
    IF EXISTS (SELECT 1 FROM plan_templates WHERE account_id = v_account_id) THEN
      CONTINUE;
    END IF;

    INSERT INTO plan_templates
      (account_id, name, tier, description, visit_count_per_year,
       included_labor_minutes_per_visit, base_price_cents, included_features, sort_order)
    VALUES
      (v_account_id, 'Essential Plan', 'essential',
       'Core home health check. One comprehensive visit per year covering the fundamentals.',
       1, 60, 0,
       ARRAY['1 comprehensive visit/year','Priority scheduling','Detailed home health report','Safety & system checks'],
       10),
      (v_account_id, 'Plus Plan', 'plus',
       'Two visits per year with extended labor included. The most popular choice.',
       2, 90, 0,
       ARRAY['2 comprehensive visits/year','Extended labor cap per visit','Priority scheduling','Detailed home health report','Safety & system checks'],
       20),
      (v_account_id, 'Premier Plan', 'premier',
       'Four visits per year with maximum labor included. Full coverage, no surprises.',
       4, 120, 0,
       ARRAY['4 comprehensive visits/year','Maximum labor cap per visit','VIP priority scheduling','Detailed home health report','Safety & system checks','Seasonal prep included'],
       30);

    -- Fetch the IDs we just inserted
    SELECT id INTO t_essential FROM plan_templates
      WHERE account_id = v_account_id AND tier = 'essential';
    SELECT id INTO t_plus FROM plan_templates
      WHERE account_id = v_account_id AND tier = 'plus';
    SELECT id INTO t_premier FROM plan_templates
      WHERE account_id = v_account_id AND tier = 'premier';

    -- Link existing subscriptions to matching template
    UPDATE maintenance_plans
      SET plan_template_id = t_essential
      WHERE account_id = v_account_id AND membership_tier = 'essential' AND plan_template_id IS NULL;

    UPDATE maintenance_plans
      SET plan_template_id = t_plus
      WHERE account_id = v_account_id AND membership_tier = 'plus' AND plan_template_id IS NULL;

    UPDATE maintenance_plans
      SET plan_template_id = t_premier
      WHERE account_id = v_account_id AND membership_tier = 'premier' AND plan_template_id IS NULL;

  END LOOP;
END $$;
