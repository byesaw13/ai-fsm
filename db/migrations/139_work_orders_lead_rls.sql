-- Assigned lead can update their work order (checklist toggles + closeout).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'work_orders' AND policyname = 'work_orders_update_assigned_lead'
  ) THEN
    CREATE POLICY work_orders_update_assigned_lead ON work_orders
      FOR UPDATE
      USING (
        account_id = app_account_id()
        AND assigned_user_id = app_user_id()
      );
  END IF;
END $$;