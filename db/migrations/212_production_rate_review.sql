-- Migration 212: owner review of production rates against Craftsman (TASK-219).
-- The owner compared each seeded rate with Craftsman repair-work hours on
-- 2026-10-27 and chose a value. Eight rates change; the other thirteen are
-- kept. Each UPDATE changes a row only while it still holds the seeded value,
-- so a rate the owner has since edited is left alone. calibrated stays false:
-- it means "confirmed by our own job actuals", which Craftsman is not.
-- Hours per day for conversion: 8 (TASK-193 default).

UPDATE production_rates SET base_rate = 7,
  notes = notes || ' Reviewed 2026-10-27 against Craftsman (repair book: faucet 0.557 h + remove 0.356 h); owner set 7 a day, between ours (6) and Craftsman (8.8).'
WHERE service_code = '2001' AND scope_component_key = 'fixture_count' AND base_rate = 6;

UPDATE production_rates SET base_rate = 4,
  notes = notes || ' Reviewed 2026-10-27 against Craftsman (repair book 1.68 h, remodel book 3.56 h); owner set 4 a day (2 h).'
WHERE service_code = '2005' AND scope_component_key = 'fixture_count' AND base_rate = 3;

UPDATE production_rates SET base_rate = 9,
  notes = notes || ' Reviewed 2026-10-27 against Craftsman (repair book sink finish plumbing 0.475 h, remodel book 1.33 h); owner set 9 a day.'
WHERE service_code = '2006' AND scope_component_key = 'fixture_count' AND base_rate = 6;

UPDATE production_rates SET base_rate = 6,
  notes = notes || ' Reviewed 2026-10-27 against Craftsman (treated 2x6 decking 0.037 h/SF + remove 0.026 h/SF, about 1.04 h a set); owner set 6 a day.'
WHERE service_code = '4007' AND scope_component_key = 'piece_count' AND base_rate = 5;

UPDATE production_rates SET base_rate = 12.5,
  notes = notes || ' Reviewed 2026-10-27 against Craftsman (straight stairs 0.474 to 0.517 h per step + remove 0.122 h); owner adopted 12.5 a day.'
WHERE service_code = '4009' AND scope_component_key = 'piece_count' AND base_rate = 4;

UPDATE production_rates SET base_rate = 9,
  notes = notes || ' Reviewed 2026-10-27 against Craftsman (paint interior door: prime 0.340 h + 2 coats 0.538 h); owner adopted 9 a day.'
WHERE service_code = '5002' AND scope_component_key = 'door_count' AND base_rate = 6;

UPDATE production_rates SET base_rate = 470,
  notes = notes || ' Reviewed 2026-10-27 against Craftsman (jamb & casing, 2 coats 0.017 h/LF); owner adopted 470 LF a day.'
WHERE service_code = '5003' AND scope_component_key = 'trim_linear_ft' AND base_rate = 120;

UPDATE production_rates SET base_rate = 410,
  notes = notes || ' Reviewed 2026-10-27 against Craftsman (remove sheet vinyl 0.175 h/SY, carpet 0.062 h/SY, tile 0.080 h/SF); owner set 410 SF a day (vinyl pace).'
WHERE service_code = '9013' AND scope_component_key = 'sqft' AND base_rate = 300;

-- Reversal (restores the seeded values; the appended review note stays):
-- UPDATE production_rates SET base_rate = 6   WHERE service_code = '2001' AND scope_component_key = 'fixture_count'  AND base_rate = 7;
-- UPDATE production_rates SET base_rate = 3   WHERE service_code = '2005' AND scope_component_key = 'fixture_count'  AND base_rate = 4;
-- UPDATE production_rates SET base_rate = 6   WHERE service_code = '2006' AND scope_component_key = 'fixture_count'  AND base_rate = 9;
-- UPDATE production_rates SET base_rate = 5   WHERE service_code = '4007' AND scope_component_key = 'piece_count'    AND base_rate = 6;
-- UPDATE production_rates SET base_rate = 4   WHERE service_code = '4009' AND scope_component_key = 'piece_count'    AND base_rate = 12.5;
-- UPDATE production_rates SET base_rate = 6   WHERE service_code = '5002' AND scope_component_key = 'door_count'     AND base_rate = 9;
-- UPDATE production_rates SET base_rate = 120 WHERE service_code = '5003' AND scope_component_key = 'trim_linear_ft' AND base_rate = 470;
-- UPDATE production_rates SET base_rate = 300 WHERE service_code = '9013' AND scope_component_key = 'sqft'           AND base_rate = 410;
