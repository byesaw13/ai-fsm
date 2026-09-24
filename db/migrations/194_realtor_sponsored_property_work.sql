-- Migration 194: realtor-sponsored property work (TASK-158).

ALTER TABLE properties DROP CONSTRAINT properties_client_id_fkey;
ALTER TABLE properties ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE properties
  ADD CONSTRAINT properties_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

CREATE TABLE property_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE RESTRICT,
  external_name text,
  external_email text,
  external_phone text,
  notes text,
  role text NOT NULL CHECK (
    role IN ('owner','realtor','beneficiary','property_manager','tenant','other')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_contact_one_identity CHECK (
    (
      client_id IS NOT NULL
      AND external_name IS NULL
      AND external_email IS NULL
      AND external_phone IS NULL
    )
    OR (
      client_id IS NULL
      AND external_name IS NOT NULL
      AND length(btrim(external_name)) > 0
    )
  )
);

CREATE INDEX idx_property_contacts_account_property
  ON property_contacts(account_id, property_id);
CREATE UNIQUE INDEX property_contacts_registered_role_unique
  ON property_contacts(property_id, client_id, role)
  WHERE client_id IS NOT NULL;

CREATE TRIGGER trg_property_contacts_updated_at
  BEFORE UPDATE ON property_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE clients
  ADD COLUMN primary_property_id uuid REFERENCES properties(id) ON DELETE SET NULL;

ALTER TABLE invoices
  ADD COLUMN billing_context text NOT NULL DEFAULT 'standard'
    CHECK (billing_context IN ('standard','realtor_sponsored')),
  ADD COLUMN sponsored_purpose text
    CHECK (
      sponsored_purpose IN (
        'pre_listing','inspection_closing','staging_appearance',
        'client_concierge','ongoing_care','other'
      )
    ),
  ADD COLUMN beneficiary_property_contact_id uuid
    REFERENCES property_contacts(id) ON DELETE RESTRICT,
  ADD COLUMN business_purpose text,
  ADD CONSTRAINT invoices_sponsored_context_shape CHECK (
    (
      billing_context = 'standard'
      AND sponsored_purpose IS NULL
      AND beneficiary_property_contact_id IS NULL
      AND business_purpose IS NULL
    )
    OR (
      billing_context = 'realtor_sponsored'
      AND property_id IS NOT NULL
      AND sponsored_purpose IS NOT NULL
      AND beneficiary_property_contact_id IS NOT NULL
    )
  );

CREATE INDEX idx_invoices_sponsored_payer
  ON invoices(client_id, created_at DESC)
  WHERE billing_context = 'realtor_sponsored';

CREATE OR REPLACE FUNCTION validate_property_contact_context()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = NEW.property_id AND p.account_id = NEW.account_id
  ) THEN
    RAISE EXCEPTION 'property_contacts must reference a property in the same account'
      USING errcode = '23514';
  END IF;

  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = NEW.client_id AND c.account_id = NEW.account_id
  ) THEN
    RAISE EXCEPTION 'registered property contact must reference a client in the same account'
      USING errcode = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_property_contacts_context
  BEFORE INSERT OR UPDATE OF account_id, property_id, client_id
  ON property_contacts
  FOR EACH ROW EXECUTE FUNCTION validate_property_contact_context();

CREATE OR REPLACE FUNCTION validate_client_primary_property()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.primary_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = NEW.primary_property_id
      AND p.account_id = NEW.account_id
      AND p.client_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'main property must use this client as primary service contact'
      USING errcode = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clients_primary_property
  BEFORE INSERT OR UPDATE OF account_id, primary_property_id
  ON clients
  FOR EACH ROW EXECUTE FUNCTION validate_client_primary_property();

CREATE OR REPLACE FUNCTION protect_primary_property_relationship()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clients c
    WHERE c.primary_property_id = OLD.id
      AND (
        NEW.account_id IS DISTINCT FROM c.account_id
        OR NEW.client_id IS DISTINCT FROM c.id
      )
  ) THEN
    RAISE EXCEPTION 'property is selected as a client''s main property'
      USING errcode = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_properties_protect_primary_relationship
  BEFORE UPDATE OF account_id, client_id
  ON properties
  FOR EACH ROW EXECUTE FUNCTION protect_primary_property_relationship();

CREATE OR REPLACE FUNCTION validate_sponsored_invoice_context()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = NEW.client_id AND c.account_id = NEW.account_id
  ) THEN
    RAISE EXCEPTION 'invoice payer must belong to invoice account'
      USING errcode = '23514';
  END IF;

  IF NEW.job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = NEW.job_id
      AND j.account_id = NEW.account_id
      AND j.client_id = NEW.client_id
  ) THEN
    RAISE EXCEPTION 'invoice project must belong to payer and invoice account'
      USING errcode = '23514';
  END IF;

  IF NEW.billing_context = 'standard' THEN
    IF NEW.sponsored_purpose IS NOT NULL
      OR NEW.beneficiary_property_contact_id IS NOT NULL
      OR NEW.business_purpose IS NOT NULL
    THEN
      RAISE EXCEPTION 'standard invoice cannot contain sponsored-work fields'
        USING errcode = '23514';
    END IF;
    IF NEW.property_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = NEW.property_id
        AND p.account_id = NEW.account_id
        AND p.client_id = NEW.client_id
    ) THEN
      RAISE EXCEPTION 'standard invoice property must belong to payer and invoice account'
        USING errcode = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.property_id IS NULL
    OR NEW.sponsored_purpose IS NULL
    OR NEW.beneficiary_property_contact_id IS NULL
  THEN
    RAISE EXCEPTION 'sponsored invoice requires property, beneficiary, and purpose'
      USING errcode = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = NEW.property_id AND p.account_id = NEW.account_id
  ) THEN
    RAISE EXCEPTION 'sponsored property must belong to invoice account'
      USING errcode = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM property_contacts pc
    WHERE pc.id = NEW.beneficiary_property_contact_id
      AND pc.account_id = NEW.account_id
      AND pc.property_id = NEW.property_id
  ) THEN
    RAISE EXCEPTION 'sponsored beneficiary must belong to selected property'
      USING errcode = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoices_sponsored_context
  BEFORE INSERT OR UPDATE OF
    account_id, client_id, job_id, property_id, billing_context,
    sponsored_purpose, beneficiary_property_contact_id, business_purpose
  ON invoices
  FOR EACH ROW EXECUTE FUNCTION validate_sponsored_invoice_context();

ALTER TABLE property_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY property_contacts_select ON property_contacts
  FOR SELECT USING (
    account_id = app_account_id() AND app_role() IN ('owner','admin')
  );
CREATE POLICY property_contacts_insert ON property_contacts
  FOR INSERT WITH CHECK (
    account_id = app_account_id() AND app_role() IN ('owner','admin')
  );
CREATE POLICY property_contacts_update ON property_contacts
  FOR UPDATE USING (
    account_id = app_account_id() AND app_role() IN ('owner','admin')
  ) WITH CHECK (
    account_id = app_account_id() AND app_role() IN ('owner','admin')
  );
CREATE POLICY property_contacts_delete ON property_contacts
  FOR DELETE USING (
    account_id = app_account_id() AND app_role() IN ('owner','admin')
  );

-- Keep the four sponsored-work fields frozen with the other invoice facts.
CREATE OR REPLACE FUNCTION enforce_invoice_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (
    old.status IN ('sent', 'partial', 'overdue')
    AND new.status                 IS NOT DISTINCT FROM old.status
    AND new.client_id              IS NOT DISTINCT FROM old.client_id
    AND new.job_id                 IS NOT DISTINCT FROM old.job_id
    AND new.estimate_id            IS NOT DISTINCT FROM old.estimate_id
    AND new.property_id            IS NOT DISTINCT FROM old.property_id
    AND new.invoice_number         IS NOT DISTINCT FROM old.invoice_number
    AND new.invoice_kind           IS NOT DISTINCT FROM old.invoice_kind
    AND new.subtotal_cents         IS NOT DISTINCT FROM old.subtotal_cents
    AND new.tax_cents              IS NOT DISTINCT FROM old.tax_cents
    AND new.total_cents            IS NOT DISTINCT FROM old.total_cents
    AND new.paid_cents             IS NOT DISTINCT FROM old.paid_cents
    AND new.deposit_cents          IS NOT DISTINCT FROM old.deposit_cents
    AND new.balance_cents          IS NOT DISTINCT FROM old.balance_cents
    AND new.deposit_type           IS NOT DISTINCT FROM old.deposit_type
    AND new.deposit_percentage     IS NOT DISTINCT FROM old.deposit_percentage
    AND new.deposit_fixed_cents    IS NOT DISTINCT FROM old.deposit_fixed_cents
    AND new.deposit_paid_at        IS NOT DISTINCT FROM old.deposit_paid_at
    AND new.square_order_id        IS NOT DISTINCT FROM old.square_order_id
    AND new.square_checkout_id     IS NOT DISTINCT FROM old.square_checkout_id
    AND new.square_payment_link_url IS NOT DISTINCT FROM old.square_payment_link_url
    AND new.notes                  IS NOT DISTINCT FROM old.notes
    AND new.work_summary           IS NOT DISTINCT FROM old.work_summary
    AND new.show_itemized_receipts IS NOT DISTINCT FROM old.show_itemized_receipts
    AND new.billing_context        IS NOT DISTINCT FROM old.billing_context
    AND new.sponsored_purpose      IS NOT DISTINCT FROM old.sponsored_purpose
    AND new.beneficiary_property_contact_id IS NOT DISTINCT FROM old.beneficiary_property_contact_id
    AND new.business_purpose       IS NOT DISTINCT FROM old.business_purpose
    AND new.due_date               IS NOT DISTINCT FROM old.due_date
    AND new.sent_at                IS NOT DISTINCT FROM old.sent_at
    AND new.paid_at                IS NOT DISTINCT FROM old.paid_at
    AND new.share_token            IS NOT DISTINCT FROM old.share_token
    AND new.created_by             IS NOT DISTINCT FROM old.created_by
    AND new.updated_at             IS NOT DISTINCT FROM old.updated_at
    AND (
      new.first_viewed_at IS DISTINCT FROM old.first_viewed_at
      OR new.last_viewed_at IS DISTINCT FROM old.last_viewed_at
      OR new.view_count IS DISTINCT FROM old.view_count
    )
  ) THEN
    RETURN new;
  END IF;

  IF new.status = 'sent' AND old.status = 'draft' AND new.paid_cents > 0 THEN
    new.status := CASE
      WHEN new.paid_cents + GREATEST(COALESCE(new.deposit_cents, 0), 0) >= new.total_cents THEN 'paid'
      ELSE 'partial'
    END;
  END IF;

  IF new.status IN ('sent', 'partial', 'paid') AND old.status = 'draft' THEN
    new.sent_at := COALESCE(new.sent_at, now());
  END IF;

  IF new.status = 'paid' AND old.status != 'paid' THEN
    new.paid_at := COALESCE(new.paid_at, now());
  END IF;

  IF old.status IN ('sent', 'partial', 'overdue') AND new.status = 'draft' AND new.paid_cents = old.paid_cents THEN
    IF (
      new.client_id      IS DISTINCT FROM old.client_id      OR
      new.job_id         IS DISTINCT FROM old.job_id         OR
      new.estimate_id    IS DISTINCT FROM old.estimate_id    OR
      new.property_id    IS DISTINCT FROM old.property_id    OR
      new.invoice_number IS DISTINCT FROM old.invoice_number OR
      new.subtotal_cents IS DISTINCT FROM old.subtotal_cents OR
      new.tax_cents      IS DISTINCT FROM old.tax_cents      OR
      new.total_cents    IS DISTINCT FROM old.total_cents    OR
      new.notes          IS DISTINCT FROM old.notes          OR
      new.work_summary   IS DISTINCT FROM old.work_summary   OR
      new.show_itemized_receipts IS DISTINCT FROM old.show_itemized_receipts OR
      new.billing_context IS DISTINCT FROM old.billing_context OR
      new.sponsored_purpose IS DISTINCT FROM old.sponsored_purpose OR
      new.beneficiary_property_contact_id IS DISTINCT FROM old.beneficiary_property_contact_id OR
      new.business_purpose IS DISTINCT FROM old.business_purpose OR
      new.due_date       IS DISTINCT FROM old.due_date       OR
      new.created_by     IS DISTINCT FROM old.created_by
    ) THEN
      RAISE EXCEPTION
        'invoice reopen to draft may only change status and sent_at'
        USING errcode = 'P0001';
    END IF;

    new.sent_at := NULL;
    RETURN new;
  END IF;

  IF (
    old.status != 'void'
    AND new.status              IS NOT DISTINCT FROM old.status
    AND new.invoice_number      IS NOT DISTINCT FROM old.invoice_number
    AND new.subtotal_cents      IS NOT DISTINCT FROM old.subtotal_cents
    AND new.tax_cents           IS NOT DISTINCT FROM old.tax_cents
    AND new.total_cents         IS NOT DISTINCT FROM old.total_cents
    AND new.paid_cents          IS NOT DISTINCT FROM old.paid_cents
    AND new.deposit_cents       IS NOT DISTINCT FROM old.deposit_cents
    AND new.balance_cents       IS NOT DISTINCT FROM old.balance_cents
    AND new.notes               IS NOT DISTINCT FROM old.notes
    AND new.work_summary        IS NOT DISTINCT FROM old.work_summary
    AND new.show_itemized_receipts IS NOT DISTINCT FROM old.show_itemized_receipts
    AND new.billing_context     IS NOT DISTINCT FROM old.billing_context
    AND new.sponsored_purpose   IS NOT DISTINCT FROM old.sponsored_purpose
    AND new.beneficiary_property_contact_id IS NOT DISTINCT FROM old.beneficiary_property_contact_id
    AND new.business_purpose    IS NOT DISTINCT FROM old.business_purpose
    AND new.due_date            IS NOT DISTINCT FROM old.due_date
    AND new.sent_at             IS NOT DISTINCT FROM old.sent_at
    AND new.paid_at             IS NOT DISTINCT FROM old.paid_at
    AND new.estimate_id         IS NOT DISTINCT FROM old.estimate_id
    AND new.created_by          IS NOT DISTINCT FROM old.created_by
    AND (
      new.client_id   IS DISTINCT FROM old.client_id
      OR new.job_id  IS DISTINCT FROM old.job_id
      OR new.property_id IS DISTINCT FROM old.property_id
    )
  ) THEN
    RETURN new;
  END IF;

  IF old.status IN ('sent', 'partial', 'overdue') THEN
    IF (
      new.client_id        IS DISTINCT FROM old.client_id        OR
      new.job_id           IS DISTINCT FROM old.job_id           OR
      new.estimate_id      IS DISTINCT FROM old.estimate_id      OR
      new.property_id      IS DISTINCT FROM old.property_id      OR
      new.invoice_number   IS DISTINCT FROM old.invoice_number   OR
      new.subtotal_cents   IS DISTINCT FROM old.subtotal_cents   OR
      new.tax_cents        IS DISTINCT FROM old.tax_cents        OR
      new.total_cents      IS DISTINCT FROM old.total_cents      OR
      new.notes            IS DISTINCT FROM old.notes            OR
      new.work_summary     IS DISTINCT FROM old.work_summary     OR
      new.show_itemized_receipts IS DISTINCT FROM old.show_itemized_receipts OR
      new.billing_context  IS DISTINCT FROM old.billing_context  OR
      new.sponsored_purpose IS DISTINCT FROM old.sponsored_purpose OR
      new.beneficiary_property_contact_id IS DISTINCT FROM old.beneficiary_property_contact_id OR
      new.business_purpose IS DISTINCT FROM old.business_purpose OR
      (
        new.due_date IS DISTINCT FROM old.due_date
        AND NOT (old.due_date IS NULL AND new.due_date IS NOT NULL)
      ) OR
      new.sent_at          IS DISTINCT FROM old.sent_at          OR
      new.created_by       IS DISTINCT FROM old.created_by
    ) THEN
      RAISE EXCEPTION
        'invoice in % state: only paid_cents, status, and one-time due_date fill may be updated', old.status
        USING errcode = 'P0001';
    END IF;
  END IF;

  IF old.status IN ('paid', 'void') THEN
    RAISE EXCEPTION
      'invoice in % state is immutable', old.status
      USING errcode = 'P0001';
  END IF;

  RETURN new;
END;
$$;

-- Reversal: restore the function from 193, drop the sponsored invoice columns,
-- client primary_property_id, property_contacts, then restore properties.client_id
-- NOT NULL and its original ON DELETE CASCADE foreign key.
