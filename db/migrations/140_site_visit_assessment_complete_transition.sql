-- Pre-sale site visits close when assessment completes, without requiring the
-- field dispatch chain (scheduled → arrived → in_progress → completed).
-- Assessment cascade and repair scripts set status = 'completed' directly.

CREATE OR REPLACE FUNCTION validate_visit_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed text[];
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Site visit assessment close-out: allow direct completion from any open status.
  IF OLD.visit_type = 'site_visit'
     AND NEW.status = 'completed'
     AND OLD.status NOT IN ('completed', 'cancelled') THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('arrived', 'in_progress', 'dispatched', 'traveling')
     AND NEW.assigned_user_id IS NULL THEN
    RAISE EXCEPTION
      'visit cannot transition to % without an assigned user', NEW.status
      USING ERRCODE = 'P0001';
  END IF;

  allowed := CASE OLD.status
    WHEN 'scheduled'   THEN ARRAY['dispatched', 'arrived', 'cancelled']
    WHEN 'dispatched'  THEN ARRAY['traveling', 'arrived', 'cancelled']
    WHEN 'traveling'   THEN ARRAY['arrived', 'cancelled']
    WHEN 'arrived'     THEN ARRAY['in_progress', 'waiting', 'cancelled']
    WHEN 'in_progress' THEN ARRAY['waiting', 'completed', 'cancelled']
    WHEN 'waiting'     THEN ARRAY['in_progress', 'cancelled']
    WHEN 'completed'   THEN ARRAY[]::text[]
    WHEN 'cancelled'   THEN ARRAY[]::text[]
    ELSE                    ARRAY[]::text[]
  END;

  IF NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION
      'invalid visit transition: % → % (allowed: %)',
      OLD.status, NEW.status, array_to_string(allowed, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'arrived' AND OLD.status <> 'arrived' THEN
    NEW.arrived_at := now();
  END IF;

  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    NEW.completed_at := now();
  END IF;

  RETURN NEW;
END;
$$;