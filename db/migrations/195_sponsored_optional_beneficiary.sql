-- Migration 195: beneficiary ("work for") optional on realtor-sponsored invoices (TASK-159).
-- A sponsored invoice needs payer, property, and purpose; a beneficiary, when
-- set, must still belong to the selected property.

ALTER TABLE invoices DROP CONSTRAINT invoices_sponsored_context_shape;
ALTER TABLE invoices
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
    )
  );

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

  IF NEW.property_id IS NULL OR NEW.sponsored_purpose IS NULL THEN
    RAISE EXCEPTION 'sponsored invoice requires property and purpose'
      USING errcode = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = NEW.property_id AND p.account_id = NEW.account_id
  ) THEN
    RAISE EXCEPTION 'sponsored property must belong to invoice account'
      USING errcode = '23514';
  END IF;

  IF NEW.beneficiary_property_contact_id IS NOT NULL AND NOT EXISTS (
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


-- Reversal: restore the 194 constraint (beneficiary NOT NULL) and the 194
-- validate_sponsored_invoice_context() body; first give every sponsored
-- invoice without a beneficiary a property contact.
