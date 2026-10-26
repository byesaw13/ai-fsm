-- Migration 207: realistic wall painting pace (TASK-184).
--
-- Production rate 5012 (interior walls, two finish coats, standard prep, solo)
-- was seeded at 200 wall sq ft per day, about 25 sq ft an hour. That would put
-- a 12 x 12 bedroom at two days. The owner paints at an average pace; 400 sq ft
-- a day (50 an hour, setup and cleanup included) matches the owner's own price
-- book hours for a typical room (7-11 h for about 470 sq ft of wall).
-- Prepare Quote now uses this rate for wall painting hours.
-- Only changes the row while it still holds the seeded value.

UPDATE production_rates
SET base_rate = 400
WHERE service_code = '5012' AND scope_component_key = 'wall_sqft' AND base_rate = 200;

-- Reversal:
-- UPDATE production_rates SET base_rate = 200
-- WHERE service_code = '5012' AND scope_component_key = 'wall_sqft' AND base_rate = 400;
