-- Migration 125: work orders (TASK-018 slice 3).
--
-- A work order is generated from a site assessment, fully editable, with a
-- status lifecycle. Mirrors the estimates/change_orders conventions. The schema
-- is built so slice 4 (completed work orders → property timeline) is a drop-in:
-- property_id + completed_at + a queryable materials child are all present.

CREATE TABLE IF NOT EXISTS work_orders (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id             UUID         NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  job_id                UUID         REFERENCES jobs(id) ON DELETE SET NULL,
  property_id           UUID         REFERENCES properties(id) ON DELETE SET NULL,
  title                 TEXT         NOT NULL,
  scope                 TEXT,
  site_notes            TEXT,
  safety_notes          TEXT,
  rooms                 JSONB        NOT NULL DEFAULT '[]',
  status                TEXT         NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','scheduled','in_progress','completed','cancelled')),
  total_cents           INT          NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  notes                 TEXT,
  source_visit_id       UUID         REFERENCES visits(id) ON DELETE SET NULL,
  source_assessment_id  UUID         REFERENCES site_visit_assessments(id) ON DELETE SET NULL,
  completed_at          TIMESTAMPTZ,
  created_by            UUID         NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_orders_account_status ON work_orders (account_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_property ON work_orders (property_id);

CREATE TRIGGER trg_work_orders_updated_at BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders FORCE  ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_orders' AND policyname='work_orders_select') THEN
    CREATE POLICY work_orders_select ON work_orders FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_orders' AND policyname='work_orders_insert') THEN
    CREATE POLICY work_orders_insert ON work_orders FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_orders' AND policyname='work_orders_update') THEN
    CREATE POLICY work_orders_update ON work_orders FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_orders' AND policyname='work_orders_delete') THEN
    CREATE POLICY work_orders_delete ON work_orders FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS work_order_materials (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id     UUID         NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  description       TEXT         NOT NULL,
  quantity          NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_price_cents  INT          NOT NULL CHECK (unit_price_cents >= 0),
  total_cents       INT          NOT NULL CHECK (total_cents >= 0),
  sort_order        INT          NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_order_materials_work_order ON work_order_materials (work_order_id);

ALTER TABLE work_order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_materials FORCE  ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_order_materials' AND policyname='wom_select') THEN
    CREATE POLICY wom_select ON work_order_materials FOR SELECT USING (
      EXISTS (SELECT 1 FROM work_orders w WHERE w.id = work_order_id AND w.account_id = app_account_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_order_materials' AND policyname='wom_insert') THEN
    CREATE POLICY wom_insert ON work_order_materials FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM work_orders w WHERE w.id = work_order_id AND w.account_id = app_account_id() AND app_role() IN ('owner','admin')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_order_materials' AND policyname='wom_update') THEN
    CREATE POLICY wom_update ON work_order_materials FOR UPDATE USING (
      EXISTS (SELECT 1 FROM work_orders w WHERE w.id = work_order_id AND w.account_id = app_account_id() AND app_role() IN ('owner','admin')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_order_materials' AND policyname='wom_delete') THEN
    CREATE POLICY wom_delete ON work_order_materials FOR DELETE USING (
      EXISTS (SELECT 1 FROM work_orders w WHERE w.id = work_order_id AND w.account_id = app_account_id() AND app_role() IN ('owner','admin')));
  END IF;
END $$;

-- Reversal:
-- DROP TABLE IF EXISTS work_order_materials;
-- DROP TABLE IF EXISTS work_orders;
