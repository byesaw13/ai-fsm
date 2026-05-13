-- Allow visits to be cancelled from in_progress state.
-- Previously in_progress was terminal (only → completed).
-- A missed or abandoned visit needs to be cancellable without
-- forcing it through completion.

CREATE OR REPLACE FUNCTION validate_visit_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
declare
  allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  -- require assigned tech before arriving
  if new.status = 'arrived' and new.assigned_user_id is null then
    raise exception
      'visit cannot transition to arrived without an assigned user'
      using errcode = 'P0001';
  end if;

  allowed := case old.status
    when 'scheduled'   then array['arrived', 'cancelled']
    when 'arrived'     then array['in_progress', 'cancelled']
    when 'in_progress' then array['completed', 'cancelled']
    when 'completed'   then array[]::text[]
    when 'cancelled'   then array[]::text[]
    else                    array[]::text[]
  end;

  if not (new.status = any(allowed)) then
    raise exception
      'invalid visit transition: % → % (allowed: %)',
      old.status, new.status, array_to_string(allowed, ', ')
      using errcode = 'P0001';
  end if;

  -- auto-set timestamps on transition
  if new.status = 'arrived' and old.status != 'arrived' then
    new.arrived_at := now();
  end if;

  if new.status = 'completed' and old.status != 'completed' then
    new.completed_at := now();
  end if;

  return new;
end;
$$;
