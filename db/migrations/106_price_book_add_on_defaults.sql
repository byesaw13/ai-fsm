-- Migration 106: Price Book Add-On Defaults
-- Populates discounted same-visit add-on prices that were previously only described in notes.

UPDATE price_book SET add_on_price_cents = 7500
  WHERE code IN (
    '3001',  -- additional light fixture
    '3003',  -- additional outlet/switch
    '7001'   -- additional TV mount
  );

UPDATE price_book SET add_on_price_cents = 15000
  WHERE code = '3002';  -- additional ceiling fan

UPDATE price_book SET add_on_price_cents = 10000
  WHERE code = '3004';  -- additional GFCI outlet

UPDATE price_book SET add_on_price_cents = 5000
  WHERE code IN (
    '4005',  -- additional floating shelf
    '4007',  -- additional deck board
    '7009'   -- additional bath accessory
  );
