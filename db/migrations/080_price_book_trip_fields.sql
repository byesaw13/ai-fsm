-- Migration 080: Price Book Trip Count, Material Inclusion, and Risk Flags
-- Adds structured fields that were previously embedded in free-text notes.
-- All changes are additive and reversible.

ALTER TABLE price_book ADD COLUMN IF NOT EXISTS default_trip_count SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS return_trip_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS material_inclusion TEXT NOT NULL DEFAULT 'billed_separately'
  CHECK (material_inclusion IN ('none_needed', 'customer_supplied', 'tech_supplied_included', 'billed_separately'));
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS risk_flags TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN price_book.default_trip_count IS 'Typical number of trips required to complete this service (1 = single visit, 2+ = multi-day or return required)';
COMMENT ON COLUMN price_book.return_trip_required IS 'True when a return visit is always required (e.g. multi-coat drywall, paint touch-ups that must dry)';
COMMENT ON COLUMN price_book.material_inclusion IS 'How materials factor into this price: none_needed=no materials, customer_supplied=client brings the item, tech_supplied_included=consumables bundled in price, billed_separately=materials tracked and billed as separate line item';
COMMENT ON COLUMN price_book.risk_flags IS 'Array of risk indicators: permit_risk, licensed_trade_adjacent, lead_rrp_risk, structural_risk, two_person_job';

-- ---------------------------------------------------------------------------
-- Seed structured values for services that have non-default behavior
-- ---------------------------------------------------------------------------

-- Multi-trip / return visit required
UPDATE price_book SET default_trip_count = 2, return_trip_required = true
  WHERE code IN ('1002', '5009');  -- drywall 6-12", touch-up paint >6"

UPDATE price_book SET default_trip_count = 3, return_trip_required = true
  WHERE code IN ('1003', '1004');  -- drywall >12", texture match

-- Material inclusion: customer supplies the primary item
UPDATE price_book SET material_inclusion = 'customer_supplied'
  WHERE code IN (
    '1005',  -- door slab (customer provides door)
    '2005',  -- toilet replacement (customer provides toilet)
    '2007',  -- garbage disposal (customer provides unit)
    '2008',  -- dishwasher hookup (customer provides appliance)
    '2009',  -- washer/dryer hookup (customer provides appliance)
    '3002',  -- ceiling fan (customer provides fan)
    '4007',  -- deck boards (customer provides decking)
    '4008',  -- fence panel (customer provides panel)
    '6005',  -- shed assembly (customer provides kit)
    '8002'   -- filter changes (customer provides filters)
  );

-- Material inclusion: tech supplies consumables, included in price
UPDATE price_book SET material_inclusion = 'tech_supplied_included'
  WHERE code IN (
    '8003',  -- weatherstripping
    '8004',  -- door sweep
    '5011',  -- caulking & sealing (caulk included)
    '6008'   -- exterior caulking/weatherproofing
  );

-- Material inclusion: no materials needed (labor/service only)
UPDATE price_book SET material_inclusion = 'none_needed'
  WHERE code IN (
    '4001', '4002', '4003',  -- furniture assembly (customer has furniture)
    '6001',  -- gutter cleaning
    '6003',  -- pressure washing
    '6004',  -- patio furniture assembly
    '6007',  -- house number install (just labor)
    '2002',  -- showerhead (customer provides showerhead)
    '2004',  -- toilet seat (customer provides seat)
    '3001',  -- light fixture (customer provides fixture)
    '3003',  -- outlet/switch (customer provides device)
    '3004',  -- GFCI outlet
    '3005',  -- dimmer switch
    '3006',  -- smart doorbell
    '3007',  -- smart thermostat
    '3008',  -- smoke detector
    '3009',  -- motion sensor light
    '7001', '7002', '7003', '7004', '7005', '7006', '7007', '7008', '7009', '7010',  -- mounting & installs
    '8001'   -- dryer vent cleaning (no materials)
  );

-- Risk flags: permit risk
UPDATE price_book SET risk_flags = array_append(risk_flags, 'permit_risk')
  WHERE code IN (
    '3010',  -- under-cabinet lighting (wiring)
    '9005',  -- exterior structural repairs
    '9001'   -- specialty project (catch-all)
  );

-- Risk flags: licensed trade adjacent (close to or at boundary of licensed work)
UPDATE price_book SET risk_flags = array_append(risk_flags, 'licensed_trade_adjacent')
  WHERE code IN (
    '3010',  -- under-cabinet lighting
    '2008',  -- dishwasher hookup (plumbing/electrical)
    '2009',  -- washer/dryer hookup
    '2010',  -- leak detection
    '9005'   -- exterior structural
  );

-- Risk flags: lead RRP risk (disturbs painted surfaces in pre-1978 homes)
UPDATE price_book SET risk_flags = array_append(risk_flags, 'lead_rrp_risk')
  WHERE code IN (
    '1001', '1002', '1003', '1004',  -- drywall patches
    '1011', '1012', '1013',           -- baseboard/trim/crown
    '5001', '5002', '5003', '5004', '5005', '5006', '5007', '5008', '5009',  -- all painting
    '9002', '9003'                    -- specialty drywall/painting
  );

-- Risk flags: structural risk
UPDATE price_book SET risk_flags = array_append(risk_flags, 'structural_risk')
  WHERE code IN (
    '4007',  -- deck boards
    '4008',  -- fence panel
    '4009',  -- stair/step repair
    '4010',  -- handrail
    '9005',  -- exterior structural
    '8007'   -- siding repairs
  );

-- Risk flags: two person job
UPDATE price_book SET risk_flags = array_append(risk_flags, 'two_person_job')
  WHERE code IN (
    '5010',  -- garage floor epoxy
    '6005',  -- shed assembly
    '9003',  -- large-scale painting
    '9004'   -- custom carpentry/fabrication
  );

-- ---------------------------------------------------------------------------
-- Reversal (for reference — run manually if needed)
-- ---------------------------------------------------------------------------
-- ALTER TABLE price_book
--   DROP COLUMN IF EXISTS default_trip_count,
--   DROP COLUMN IF EXISTS return_trip_required,
--   DROP COLUMN IF EXISTS material_inclusion,
--   DROP COLUMN IF EXISTS risk_flags;
