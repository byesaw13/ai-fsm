-- Migration 116: allow vehicle Bluetooth event kinds (TASK-025 slice 2).
--
-- Migration 114 constrained location_events.kind to the original four kinds.
-- Slice 2 adds vehicle_connect / vehicle_disconnect, so widen the CHECK or the
-- ingest INSERT fails the constraint.

ALTER TABLE location_events DROP CONSTRAINT IF EXISTS location_events_kind_check;

ALTER TABLE location_events
  ADD CONSTRAINT location_events_kind_check
  CHECK (kind IN (
    'zone_enter', 'zone_leave', 'location_update', 'activity_change',
    'vehicle_connect', 'vehicle_disconnect'
  ));

-- Reversal (only safe if no vehicle_* rows exist):
-- ALTER TABLE location_events DROP CONSTRAINT IF EXISTS location_events_kind_check;
-- ALTER TABLE location_events ADD CONSTRAINT location_events_kind_check
--   CHECK (kind IN ('zone_enter','zone_leave','location_update','activity_change'));
