-- Migration 018: Price Book (1000-Series Handyman Service Catalog)
-- Provides a structured service catalog for one-click estimate generation.
-- Services are organized by code (1000-series), tier, and price range.

-- Enum for service tiers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'price_book_tier') THEN
    CREATE TYPE price_book_tier AS ENUM ('core', 'standard', 'specialty');
  END IF;
END $$;

-- Enum for service categories
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'price_book_category') THEN
    CREATE TYPE price_book_category AS ENUM (
      'general_repairs',
      'plumbing',
      'electrical',
      'carpentry_furniture',
      'painting_finishes',
      'outdoor_seasonal',
      'mounting_installs',
      'maintenance_small',
      'specialty_expansion'
    );
  END IF;
END $$;

-- Core price book table
CREATE TABLE IF NOT EXISTS price_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) NOT NULL UNIQUE,           -- e.g. "1001", "2001"
  name VARCHAR(255) NOT NULL,                  -- e.g. "Drywall patch <=6\""
  category price_book_category NOT NULL,
  tier price_book_tier NOT NULL,
  price_min_cents INT NOT NULL,               -- minimum price in cents
  price_max_cents INT,                         -- NULL means "and up" (open-ended)
  description TEXT,                            -- customer-facing description
  notes TEXT,                                  -- internal notes / conditions
  default_labor_hours DECIMAL(5,2),            -- estimated labor hours
  requires_materials BOOLEAN DEFAULT false,    -- whether materials are typically needed
  upsell_codes VARCHAR(10)[],                  -- array of related service codes to suggest
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast search by code, name, category, tier
CREATE INDEX IF NOT EXISTS idx_price_book_code ON price_book (code);
CREATE INDEX IF NOT EXISTS idx_price_book_category ON price_book (category);
CREATE INDEX IF NOT EXISTS idx_price_book_tier ON price_book (tier);
CREATE INDEX IF NOT EXISTS idx_price_book_active ON price_book (is_active) WHERE is_active = true;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_price_book_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_price_book_updated ON price_book;
CREATE TRIGGER trg_price_book_updated
  BEFORE UPDATE ON price_book
  FOR EACH ROW
  EXECUTE FUNCTION update_price_book_timestamp();

-- Seed the 1000-series handyman price book
INSERT INTO price_book (code, name, category, tier, price_min_cents, price_max_cents, description, notes, default_labor_hours, requires_materials, upsell_codes) VALUES
-- General Repairs (1000-1999)
('1001', 'Drywall patch <=6"', 'general_repairs', 'core', 15000, 17500, 'Same-day fix with fast-dry mud. Covers nail pops, dents, and small holes.', 'Quick repair, typically <1 hour.', 1.0, true, ARRAY['1008', '1010']),
('1002', 'Drywall patch 6-12"', 'general_repairs', 'standard', 25000, 32500, '1-2 day process. Requires return visit for sanding/finish. Flat rate covers multiple trips.', NULL, 2.0, true, ARRAY['1001', '5009']),
('1003', 'Drywall patch >12"', 'general_repairs', 'specialty', 39500, NULL, '3-4 days with multiple coats, sanding, and priming. Includes return visits.', NULL, 4.0, true, ARRAY['1004', '5009']),
('1004', 'Drywall patch with texture match', 'general_repairs', 'specialty', 42500, NULL, '2-4 days. Add $50-$100 surcharge for texture blending/matching.', NULL, 4.0, true, ARRAY['1003', '5009']),
('1005', 'Door slab replacement', 'general_repairs', 'standard', 29500, NULL, 'Includes hinge/hardware transfer. Specialty or non-standard sizes may increase rate.', 'Customer provides door.', 2.0, false, ARRAY['1006', '1007']),
('1006', 'Door adjustment (sticking/rubbing)', 'general_repairs', 'core', 15000, 17500, 'Quick hinge/plane adjustment. Minimum service call applies.', NULL, 0.5, false, ARRAY['1007', '8004']),
('1007', 'Door hardware replacement', 'general_repairs', 'core', 15000, 17500, 'Flat rate includes one unit; add discounted rate for multiples.', 'Lock, handle, or hinge replacement.', 0.5, false, ARRAY['1006', '1005']),
('1008', 'Storm/screen door installation', 'general_repairs', 'specialty', 37500, NULL, 'Includes alignment and secure fit.', 'Customer provides door.', 3.0, false, ARRAY['1005', '1009']),
('1009', 'Window lock/latch repair', 'general_repairs', 'core', 15000, 17500, 'Small part replacement or alignment.', 'Add cost if hardware is custom.', 0.5, false, ARRAY['1010', '1006']),
('1010', 'Window screen replacement/repair', 'general_repairs', 'core', 15000, 17500, 'Standard mesh replacement or frame repair. Additional windows discounted.', NULL, 0.5, true, ARRAY['1009', '1011']),
('1011', 'Baseboard & trim replacement', 'general_repairs', 'standard', 25000, 32500, 'Flat rate includes removal and replacement of ~10 linear feet. Larger runs quoted separately.', NULL, 2.0, true, ARRAY['1012', '1013', '5003']),
('1012', 'Crown molding install/repair', 'general_repairs', 'specialty', 29500, NULL, 'Covers up to 25'' base + $10/ft beyond. Vaulted ceilings or premium materials may increase rate.', 'Standard: $295 base, Specialty for complex.', 3.0, true, ARRAY['1011', '1013']),
('1013', 'Chair rail installation', 'general_repairs', 'core', 17500, NULL, 'Covers up to 25'' base + $4/ft beyond. Typical dining room or hallway project.', NULL, 1.5, true, ARRAY['1011', '1012']),

-- Plumbing (2000-2999)
('2001', 'Faucet replacement', 'plumbing', 'standard', 17500, 22500, 'Basic swap. Includes supply line reconnection.', 'Specialty fixtures may increase rate.', 1.0, false, ARRAY['2002', '2006']),
('2002', 'Showerhead replacement', 'plumbing', 'core', 15000, 17500, 'Quick swap. Additional heads discounted if done in same visit.', NULL, 0.5, false, ARRAY['2001', '2003']),
('2003', 'Toilet flapper/fill valve replacement', 'plumbing', 'core', 15000, 17500, 'Includes one valve kit. Quick repair, typically <1 hour.', NULL, 0.5, true, ARRAY['2002', '2004']),
('2004', 'Toilet seat installation', 'plumbing', 'core', 15000, 15000, 'Covers standard seats. Specialty/soft-close seats included if customer supplies.', NULL, 0.25, false, ARRAY['2003', '2005']),
('2005', 'Toilet replacement (standard swap)', 'plumbing', 'standard', 32500, 37500, 'Includes removal and install of new unit.', 'Customer provides toilet.', 2.0, false, ARRAY['2003', '2006']),
('2006', 'Sink drain/P-trap replacement', 'plumbing', 'standard', 19500, 25000, 'Includes removal of old P-trap and replacement with standard parts.', NULL, 1.0, true, ARRAY['2001', '2007']),
('2007', 'Garbage disposal installation/replacement', 'plumbing', 'standard', 25000, 32500, 'Includes wiring hookup if outlet is present. New outlet installation not included.', NULL, 1.5, false, ARRAY['2006', '2008']),
('2008', 'Dishwasher hookup', 'plumbing', 'specialty', 39500, NULL, 'Includes drain and water line connection. Electrical must be pre-wired.', NULL, 2.0, false, ARRAY['2007', '2009']),
('2009', 'Washer/dryer hookup', 'plumbing', 'specialty', 49500, NULL, 'Covers connecting supply hoses, drain, and vent. No rerouting of plumbing.', NULL, 2.0, false, ARRAY['2008', '2007']),
('2010', 'Minor leak detection (non-invasive)', 'plumbing', 'standard', 22500, 29500, 'Visual and functional checks only. No wall opening or advanced diagnostics.', NULL, 1.0, false, ARRAY['2001', '2006']),

-- Electrical (3000-3999)
('3001', 'Light fixture replacement', 'electrical', 'core', 15000, 19500, 'Like-for-like swap. Add $75 per additional fixture in same visit.', NULL, 0.75, false, ARRAY['3002', '3003']),
('3002', 'Ceiling fan installation/replacement', 'electrical', 'standard', 22500, 29500, 'Includes basic swap. Add $150 for each additional fan. +$85 if new fan-rated box required.', NULL, 1.5, false, ARRAY['3001', '3005']),
('3003', 'Outlet/switch replacement', 'electrical', 'core', 15000, 17500, 'Includes one device. Add $75 per additional.', 'Like-for-like only.', 0.5, false, ARRAY['3001', '3004']),
('3004', 'GFCI outlet replacement', 'electrical', 'standard', 17500, 22500, 'Includes one unit. Add $100 per additional.', 'Required in wet locations.', 0.75, false, ARRAY['3003', '3001']),
('3005', 'Dimmer switch installation', 'electrical', 'core', 15000, 17500, 'Standard dimmers only. Smart dimmers fall under specialty pricing.', NULL, 0.5, false, ARRAY['3003', '3007']),
('3006', 'Smart doorbell installation', 'electrical', 'standard', 17500, 22500, 'Requires pre-existing wiring or Wi-Fi. Additional setup for advanced integration.', 'Ring, Nest, etc.', 1.0, false, ARRAY['3007', '3009']),
('3007', 'Smart thermostat swap', 'electrical', 'standard', 22500, 27500, 'Like-for-like replacement only. New wiring or HVAC work not included.', NULL, 1.0, false, ARRAY['3006', '3001']),
('3008', 'Smoke/CO detector installation', 'electrical', 'core', 15000, 17500, 'Battery-operated or plug-in detectors. Hardwired versions priced as Standard.', NULL, 0.5, true, ARRAY['3001', '3009']),
('3009', 'Motion sensor light installation', 'electrical', 'standard', 19500, 25000, 'Wall or eave mount. Complex wiring runs may push into Specialty.', NULL, 1.0, false, ARRAY['3001', '3008']),
('3010', 'Under-cabinet lighting installation', 'electrical', 'specialty', 39500, NULL, 'Includes mounting and wiring of low-voltage or LED strip systems. Price varies with length.', NULL, 3.0, true, ARRAY['3001', '3002']),

-- Carpentry & Furniture (4000-4999)
('4001', 'Furniture assembly (flat-pack/IKEA)', 'carpentry_furniture', 'core', 15000, 17500, 'Includes one standard piece. Add $95-$125 per additional piece.', NULL, 1.0, false, ARRAY['4002', '4003']),
('4002', 'Bed frame assembly', 'carpentry_furniture', 'core', 15000, 15000, 'Covers most consumer bed frames. Add cost for custom or oversized.', NULL, 1.0, false, ARRAY['4001', '4004']),
('4003', 'Bookshelf/entertainment center assembly', 'carpentry_furniture', 'standard', 17500, 25000, 'Pricing depends on size and complexity. Larger wall units may push into Standard.', NULL, 1.5, false, ARRAY['4001', '4004']),
('4004', 'Closet organizer installation', 'carpentry_furniture', 'standard', 29500, 35000, 'Includes one standard closet system. Custom shelving priced separately.', NULL, 2.0, false, ARRAY['4005', '4010']),
('4005', 'Floating shelves installation', 'carpentry_furniture', 'core', 15000, 19500, 'Includes up to 2 shelves. Add $50 each additional.', NULL, 0.75, false, ARRAY['4004', '7005']),
('4006', 'Built-in cabinet repair', 'carpentry_furniture', 'standard', 29500, NULL, 'Covers hinge/door adjustments, minor carpentry. Extensive rebuilds shift to Specialty.', NULL, 2.0, true, ARRAY['4007', '4004']),
('4007', 'Deck board replacement', 'carpentry_furniture', 'standard', 22500, 29500, 'Includes up to 3 boards. Add $50 each additional.', 'Customer provides decking.', 1.5, true, ARRAY['4008', '5004']),
('4008', 'Fence panel replacement', 'carpentry_furniture', 'standard', 29500, NULL, 'Includes one panel. Larger fence jobs quoted per-foot.', NULL, 1.5, true, ARRAY['4007', '4010']),
('4009', 'Stair/step repair', 'carpentry_furniture', 'standard', 29500, 35000, 'Covers one step or tread. Multiple steps priced per unit.', NULL, 2.0, true, ARRAY['4008', '4010']),
('4010', 'Handrail installation', 'carpentry_furniture', 'standard', 25000, 32500, 'Includes one straight handrail up to 8 ft. Custom bends/metal rails increase cost.', NULL, 2.0, true, ARRAY['4009', '4008']),

-- Painting & Finishes (5000-5999)
('5001', 'Accent wall painting', 'painting_finishes', 'standard', 27500, 35000, 'Includes one wall up to 150 sq ft. Larger walls or additional coats add cost.', NULL, 2.0, true, ARRAY['5002', '5003']),
('5002', 'Door painting', 'painting_finishes', 'core', 15000, 17500, 'Per door, both sides. Additional doors discounted.', NULL, 1.0, true, ARRAY['5001', '5003']),
('5003', 'Trim/baseboard painting', 'painting_finishes', 'standard', 25000, 32500, 'Includes ~50 linear ft. Larger runs priced per foot.', NULL, 2.0, true, ARRAY['5001', '5002']),
('5004', 'Fence painting/staining', 'painting_finishes', 'specialty', 49500, NULL, 'Includes prep and one coat up to 100 linear ft. Larger fences priced per ft.', NULL, 4.0, true, ARRAY['5005', '4007']),
('5005', 'Deck staining/sealing', 'painting_finishes', 'specialty', 59500, NULL, 'Includes prep and one coat up to 200 sq ft. Additional coats or repairs extra.', NULL, 5.0, true, ARRAY['5004', '4007']),
('5006', 'Cabinet painting (small scale)', 'painting_finishes', 'specialty', 49500, NULL, 'Covers up to 10 cabinet faces. Full kitchens quoted separately.', NULL, 4.0, true, ARRAY['5001', '5003']),
('5007', 'Shed painting', 'painting_finishes', 'specialty', 59500, NULL, 'Includes exterior only, up to 120 sq ft walls. Roof not included.', NULL, 4.0, true, ARRAY['5004', '6005']),
('5008', 'Touch-up painting (patches <=6")', 'painting_finishes', 'core', 15000, 17500, 'Same-day if patch is dry. Typically bundled with drywall repairs.', NULL, 0.5, true, ARRAY['1001', '5009']),
('5009', 'Touch-up painting (patches >6")', 'painting_finishes', 'standard', 22500, 29500, 'Requires return visit to align with drywall timeline.', NULL, 1.5, true, ARRAY['1002', '5008']),
('5010', 'Garage floor epoxy (small spaces)', 'painting_finishes', 'specialty', 75000, NULL, 'Includes prep and two-part epoxy coating up to 150 sq ft.', NULL, 6.0, true, ARRAY['5005', '8006']),
('5011', 'Caulking & sealing', 'painting_finishes', 'core', 15000, 19500, 'Includes one window or tub perimeter. Additional areas discounted.', 'Windows, tubs, siding.', 0.75, true, ARRAY['6008', '5003']),

-- Outdoor & Seasonal (6000-6999)
('6001', 'Gutter cleaning (1-story, <=150 ft)', 'outdoor_seasonal', 'standard', 22500, 29500, 'Includes up to 150 linear ft. Additional footage at +$1.50/ft.', NULL, 1.5, false, ARRAY['6002', '6008']),
('6002', 'Gutter guard installation', 'outdoor_seasonal', 'specialty', 49500, NULL, 'Includes installation of standard snap-in or mesh guards.', NULL, 3.0, true, ARRAY['6001', '6008']),
('6003', 'Pressure washing (deck/siding)', 'outdoor_seasonal', 'specialty', 29500, NULL, 'Covers up to 200 sq ft. Additional area priced at +$1.25/sq ft.', NULL, 2.0, false, ARRAY['5004', '5005']),
('6004', 'Patio furniture assembly', 'outdoor_seasonal', 'core', 15000, 17500, 'Includes one table + four chairs. Additional pieces at discounted add-on.', NULL, 1.0, false, ARRAY['4001', '6006']),
('6005', 'Shed assembly', 'outdoor_seasonal', 'specialty', 59500, NULL, 'Covers pre-fab kit sheds up to 8''x10''. Larger sizes quoted separately.', NULL, 5.0, false, ARRAY['6004', '5007']),
('6006', 'Mailbox install/repair', 'outdoor_seasonal', 'core', 15000, 17500, 'Includes post and box installation. Concrete setting not included.', NULL, 0.5, true, ARRAY['6007', '6008']),
('6007', 'House number installation', 'outdoor_seasonal', 'core', 15000, 15000, 'Includes mounting of one set of numbers. Decorative/illuminated styles extra.', NULL, 0.25, false, ARRAY['6006', '7005']),
('6008', 'Exterior caulking/weatherproofing', 'outdoor_seasonal', 'standard', 22500, 29500, 'Includes up to 50 linear ft of seams. Additional footage priced separately.', NULL, 1.5, true, ARRAY['6001', '5011']),
('6009', 'Storm window installation', 'outdoor_seasonal', 'standard', 29500, NULL, 'Per window. Multi-window jobs discounted.', NULL, 1.5, false, ARRAY['1008', '1010']),
('6010', 'Screen porch repair', 'outdoor_seasonal', 'specialty', 49500, NULL, 'Includes rescreening of one wall section up to 8''x10''. Larger repairs quoted per ft.', NULL, 3.0, true, ARRAY['1010', '6009']),

-- Mounting & Installs (7000-7999)
('7001', 'TV mounting (<=65")', 'mounting_installs', 'standard', 19500, 25000, 'Includes mounting to drywall with standard bracket. Add $75 for each additional TV.', NULL, 1.0, false, ARRAY['7004', '7005']),
('7002', 'Curtain rod installation', 'mounting_installs', 'core', 15000, 17500, 'Includes one window up to 6 ft. Additional rods discounted.', NULL, 0.5, false, ARRAY['7003', '7005']),
('7003', 'Blind/shade installation', 'mounting_installs', 'core', 15000, 17500, 'Includes one window. Multiple windows priced with add-on discount.', NULL, 0.5, false, ARRAY['7002', '7005']),
('7004', 'Mirror mounting', 'mounting_installs', 'standard', 15000, 22500, 'Pricing depends on weight and anchor requirements. Heavy mirrors push into Standard.', NULL, 0.75, false, ARRAY['7001', '7005']),
('7005', 'Picture/gallery wall hanging', 'mounting_installs', 'core', 15000, 17500, 'Includes up to 5 pieces. Additional pieces at +$10-$15 each.', NULL, 0.75, false, ARRAY['7001', '7004']),
('7006', 'Whiteboard/bulletin board installation', 'mounting_installs', 'core', 15000, 17500, 'Includes up to 4''x6'' board. Larger units quoted separately.', NULL, 0.5, false, ARRAY['7005', '7007']),
('7007', 'Baby gate installation', 'mounting_installs', 'core', 15000, 17500, 'Includes one gate (hardware- or pressure-mounted). Additional gates discounted.', NULL, 0.5, false, ARRAY['7008', '7006']),
('7008', 'Grab bar installation (bathroom safety)', 'mounting_installs', 'core', 15000, 19500, 'Includes one bar with proper wall anchors. Additional bars at discounted rate.', NULL, 0.5, false, ARRAY['7009', '7007']),
('7009', 'Towel bar/toilet paper holder installation', 'mounting_installs', 'core', 15000, 15000, 'Includes one accessory. Add $50 per additional in same bathroom.', NULL, 0.25, false, ARRAY['7008', '2004']),
('7010', 'Closet rod installation', 'mounting_installs', 'core', 15000, 17500, 'Includes one rod up to 6 ft. Additional rods discounted.', NULL, 0.5, false, ARRAY['4004', '7002']),

-- Maintenance & Small Jobs (8000-8999)
('8001', 'Dryer vent cleaning', 'maintenance_small', 'core', 17500, 22000, 'Includes one standard vent run <=15 ft. Longer runs or roof exits may increase cost.', NULL, 1.0, false, ARRAY['8002', '8003']),
('8002', 'Filter changes (furnace, AC, fridge)', 'maintenance_small', 'core', 15000, 15000, 'Includes up to 3 filters. Customer provides filters unless otherwise arranged.', NULL, 0.25, true, ARRAY['8001', '8003']),
('8003', 'Weatherstripping replacement', 'maintenance_small', 'core', 15000, 17500, 'Includes one standard door or window. Additional openings discounted.', NULL, 0.5, true, ARRAY['8004', '8001']),
('8004', 'Door sweep installation', 'maintenance_small', 'core', 15000, 15000, 'Includes one door. Additional sweeps priced at $50 each.', NULL, 0.25, true, ARRAY['8003', '1006']),
('8005', 'Screen door closer replacement', 'maintenance_small', 'core', 15000, 15000, 'Includes one closer. Additional units discounted.', NULL, 0.25, false, ARRAY['8003', '8004']),
('8006', 'Garage organization (hooks, racks)', 'maintenance_small', 'standard', 22500, 29500, 'Includes installation of up to 5 wall-mounted hooks/racks. Larger systems quoted separately.', NULL, 1.5, false, ARRAY['7006', '4005']),
('8007', 'Minor siding repairs', 'maintenance_small', 'standard', 29500, NULL, 'Includes one section of siding <=3 linear ft. Larger repairs priced per section.', NULL, 1.5, true, ARRAY['6008', '6001']),
('8008', 'Shutter install/repair', 'maintenance_small', 'standard', 19500, 25000, 'Per pair of shutters. Additional pairs discounted.', NULL, 1.0, false, ARRAY['6008', '1009']),
('8009', 'Foundation/seam caulking', 'maintenance_small', 'standard', 22500, 29500, 'Includes up to 50 linear ft. Additional footage priced per ft.', NULL, 1.5, true, ARRAY['6008', '5011']),
('8010', 'Attic hatch/outlet insulation', 'maintenance_small', 'specialty', 39500, NULL, 'Includes sealing and insulating one hatch or outlet. Larger attic jobs quoted separately.', NULL, 2.0, true, ARRAY['8001', '8003']),

-- Specialty & Future Expansion (9000-9999)
('9001', 'Specialty project', 'specialty_expansion', 'specialty', 49500, NULL, 'Reserved for complex/custom projects not covered in Core/Standard lists.', 'Built-ins, custom carpentry, etc.', NULL, true, ARRAY['9004', '9005']),
('9002', 'Advanced drywall/texture work', 'specialty_expansion', 'specialty', 49500, NULL, 'Full wall resurfacing, skim coating, or complex texture matching beyond patch repairs.', NULL, NULL, true, ARRAY['1003', '1004']),
('9003', 'Large-scale painting projects', 'specialty_expansion', 'specialty', 99500, NULL, 'Whole-home interiors, exteriors, or multi-room projects. Quoted by square footage.', NULL, NULL, true, ARRAY['5001', '5004', '5005']),
('9004', 'Custom carpentry/fabrication', 'specialty_expansion', 'specialty', 59500, NULL, 'Includes built-in shelving, custom furniture, or unique woodworking projects.', NULL, NULL, true, ARRAY['4004', '4006']),
('9005', 'Exterior structural repairs', 'specialty_expansion', 'specialty', 75000, NULL, 'Porch rebuilds, structural stair replacements, or heavy exterior framing repairs.', NULL, NULL, true, ARRAY['4008', '4009']),
('9006', 'Advanced seasonal jobs', 'specialty_expansion', 'specialty', 49500, NULL, 'Holiday light installation, large storm prep, or seasonal weatherproofing.', NULL, NULL, false, ARRAY['6001', '6002'])

ON CONFLICT (code) DO NOTHING;
