-- Trade definitions catalog.
-- Replaces hardcoded trade classification logic in the AI system prompt with structured DB entities.
-- Also adds production rate anchors for plumbing and carpentry service codes.
--
-- Priority 2: trade definitions as DB entities (not prompt text)
-- Priority 4: expand production rate coverage to plumbing + carpentry

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trades (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_key                 TEXT NOT NULL UNIQUE,
  display_name              TEXT NOT NULL,
  scope_template_category   TEXT,                          -- links to scope_templates.category
  service_code_range_start  TEXT NOT NULL,
  service_code_range_end    TEXT NOT NULL,
  extra_code_notes          TEXT,                          -- appended to range lock line in prompt
  detection_keywords        TEXT[] NOT NULL DEFAULT '{}',  -- triggers this trade classification
  routing_rules             JSONB  NOT NULL DEFAULT '[]',  -- [{signal, code}]
  disambiguation_rules      JSONB  NOT NULL DEFAULT '[]',  -- [{trigger, map_to, not_when, reason}]
  scope_values_guidance     TEXT,                          -- how to fill scope_values for this trade
  complexity_guidance       TEXT,                          -- when to apply which complexity factors
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  sort_order                INT NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_trade_key ON trades(trade_key);

-- ---------------------------------------------------------------------------
-- Seed: all active trades
-- ---------------------------------------------------------------------------

-- FLOORING (9010–9019)
INSERT INTO trades (
  trade_key, display_name, scope_template_category,
  service_code_range_start, service_code_range_end,
  detection_keywords, routing_rules, disambiguation_rules,
  scope_values_guidance, complexity_guidance, sort_order
) VALUES (
  'flooring', 'Flooring', 'flooring',
  '9010', '9019',
  ARRAY['LVP','vinyl plank','hardwood','laminate','carpet','subfloor',
        'floor prep','substrate leveling','self-leveling','concrete grinding',
        'feather finish floor','floor skim coat'],
  '[
    {"signal": "LVP install, vinyl plank installation, floating floor install",
     "code": "9010"},
    {"signal": "subfloor prep, concrete skim coat, floor feather finish, grinding floor, floor leveling, substrate prep",
     "code": "9011"},
    {"signal": "self-leveling compound, floor leveler pour",
     "code": "9012"},
    {"signal": "existing flooring removal, demo flooring, carpet removal, tile removal",
     "code": "9013"}
  ]',
  '[
    {"trigger": "skim coat",
     "map_to": "9011",
     "not_when": "surrounding context is clearly wall or ceiling work with no flooring mentioned",
     "reason": "skim coat in flooring context = concrete subfloor prep, NOT drywall 9002 or 1004"},
    {"trigger": "feather finish",
     "map_to": "9011",
     "not_when": "wall or painting context",
     "reason": "feather finish on a floor = subfloor leveling, NOT paint prep or texture work"}
  ]',
  'For 9010–9013: fill sqft (floor area), floor_type (lvp/hardwood/laminate/concrete_prep_only), subfloor_condition (good/minor_leveling/skim_coat/self_leveler). Set material_cost only if client supplies cost explicitly.',
  'Apply complex_layout for posts, bump-outs, diagonal runs, or heavy notching. Apply multi_trip_cure when floor prep requires cure before flooring install — also set trip_count=multi_trip and requires_drying_or_curing=true; describe the two-visit sequence in confidence_notes.',
  1
) ON CONFLICT (trade_key) DO NOTHING;

-- PAINTING (5000–5999)
INSERT INTO trades (
  trade_key, display_name, scope_template_category,
  service_code_range_start, service_code_range_end,
  extra_code_notes,
  detection_keywords, routing_rules, disambiguation_rules,
  scope_values_guidance, complexity_guidance, sort_order
) VALUES (
  'painting', 'Painting & Finishes', 'painting_finishes',
  '5000', '5999',
  '(also 9003 for whole-home or large exterior painting projects)',
  ARRAY['paint','painting','repaint','stain','primer','wall painting','ceiling painting',
        'trim painting','door painting','accent wall','touch-up paint','deck stain',
        'fence stain','cabinet paint','interior paint','exterior paint'],
  '[
    {"signal": "full room painting, multi-room painting, bedroom painting, living room painting, interior wall painting",
     "code": "5012"},
    {"signal": "trim only, baseboard painting, baseboard only, door casing paint",
     "code": "5003"},
    {"signal": "accent wall, single wall painting",
     "code": "5001"},
    {"signal": "paint touch-up small patches under 6 inches",
     "code": "5008"},
    {"signal": "paint over repaired drywall patches over 6 inches, touch-up larger areas",
     "code": "5009"},
    {"signal": "door painting, interior doors",
     "code": "5002"},
    {"signal": "deck staining, deck sealing, deck coating",
     "code": "5005"},
    {"signal": "fence painting, fence staining",
     "code": "5004"},
    {"signal": "cabinet painting, cabinet refinishing",
     "code": "5006"}
  ]',
  '[]',
  'For 5012: fill wall_sqft (required), ceiling_sqft (if ceiling included), trim_linear_ft (if trim included), door_count (if doors), coat_count (two_coats default), paint_finish (eggshell for walls, semi_gloss for trim/bath). Use room-size heuristics when not given: bedroom ~250 sqft walls, master ~320, living room ~450, bathroom ~120, kitchen ~180, hallway ~80 per 10 linear ft.',
  'Apply dark_to_light for color changes from dark to light (full prime required). Apply nicotine_staining for smoke-damaged surfaces (stain-block required). Apply occupied_home if furniture must be protected. Apply vaulted_ceilings if mentioned. Apply difficult_masking for crown molding, built-ins, chair rail, or heavy detail work.',
  2
) ON CONFLICT (trade_key) DO NOTHING;

-- PLUMBING (2000–2999)
INSERT INTO trades (
  trade_key, display_name, scope_template_category,
  service_code_range_start, service_code_range_end,
  detection_keywords, routing_rules, disambiguation_rules,
  scope_values_guidance, complexity_guidance, sort_order
) VALUES (
  'plumbing', 'Plumbing', 'plumbing',
  '2000', '2999',
  ARRAY['plumbing','faucet','showerhead','toilet','drain','P-trap','garbage disposal',
        'dishwasher hookup','washer hookup','dryer hookup','supply line','shutoff valve',
        'leak','running toilet','dripping faucet','clogged drain'],
  '[
    {"signal": "faucet replacement, faucet install, dripping faucet",
     "code": "2001"},
    {"signal": "showerhead replacement, showerhead swap",
     "code": "2002"},
    {"signal": "toilet flapper, toilet fill valve, running toilet, toilet repair",
     "code": "2003"},
    {"signal": "toilet seat replacement, toilet seat install",
     "code": "2004"},
    {"signal": "toilet replacement, new toilet, toilet swap, full toilet install",
     "code": "2005"},
    {"signal": "sink drain, P-trap replacement, drain trap",
     "code": "2006"},
    {"signal": "garbage disposal installation, garbage disposal replacement",
     "code": "2007"},
    {"signal": "dishwasher hookup, dishwasher connection, dishwasher install",
     "code": "2008"},
    {"signal": "washer hookup, dryer hookup, laundry connections",
     "code": "2009"},
    {"signal": "leak detection, find leak, water damage source investigation",
     "code": "2010"}
  ]',
  '[]',
  'For plumbing services: fill fixture_count with number of fixtures being serviced. Set access_type (easy/tight/crawlspace) if access constraints are mentioned.',
  'Apply difficult_access for fixtures in tight under-sink spaces, crawlspaces, or behind walls. Apply old_house_risk for pre-1978 homes where galvanized pipes or lead solder may be present. Note [MA:restricted] for any work requiring a licensed plumber — include in confidence_notes.',
  3
) ON CONFLICT (trade_key) DO NOTHING;

-- ELECTRICAL (3000–3999)
INSERT INTO trades (
  trade_key, display_name, scope_template_category,
  service_code_range_start, service_code_range_end,
  detection_keywords, routing_rules, disambiguation_rules,
  scope_values_guidance, complexity_guidance, sort_order
) VALUES (
  'electrical', 'Electrical', 'electrical',
  '3000', '3999',
  ARRAY['electrical','light fixture','ceiling fan','outlet','switch','GFCI',
        'dimmer','smart doorbell','smart thermostat','smoke detector','CO detector',
        'motion sensor light','under-cabinet lighting','Ring doorbell','Nest thermostat',
        'Ecobee'],
  '[
    {"signal": "light fixture replacement, light fixture swap, chandelier install",
     "code": "3001"},
    {"signal": "ceiling fan installation, ceiling fan replacement",
     "code": "3002"},
    {"signal": "outlet replacement, switch replacement, outlet swap",
     "code": "3003"},
    {"signal": "GFCI outlet, GFCI replacement, GFCI install",
     "code": "3004"},
    {"signal": "dimmer switch, dimmer install, dimmer replacement",
     "code": "3005"},
    {"signal": "smart doorbell, video doorbell, Ring, Nest doorbell, wired doorbell",
     "code": "3006"},
    {"signal": "smart thermostat, Ecobee, Nest thermostat, thermostat swap",
     "code": "3007"},
    {"signal": "smoke detector, CO detector, carbon monoxide detector, fire alarm",
     "code": "3008"},
    {"signal": "motion sensor light, motion sensor install",
     "code": "3009"},
    {"signal": "under-cabinet lighting, cabinet LED lights, LED strip lights",
     "code": "3010"}
  ]',
  '[]',
  'For electrical: fill fixture_count with number of devices. Note circuit_type if panel work is involved.',
  'Apply difficult_access for attic or crawlspace wiring. Apply old_house_risk for pre-1978 homes where knob-and-tube or aluminum wiring may be present. Note [MA:restricted] for panel work, new circuit runs, or any work a licensed electrician must perform — include in confidence_notes.',
  4
) ON CONFLICT (trade_key) DO NOTHING;

-- CARPENTRY (4000–4999)
INSERT INTO trades (
  trade_key, display_name, scope_template_category,
  service_code_range_start, service_code_range_end,
  detection_keywords, routing_rules, disambiguation_rules,
  scope_values_guidance, complexity_guidance, sort_order
) VALUES (
  'carpentry', 'Carpentry & Furniture', 'carpentry_furniture',
  '4000', '4999',
  ARRAY['carpentry','furniture assembly','IKEA','flat-pack','bed frame','bookshelf',
        'entertainment center','closet organizer','floating shelves','built-in cabinet',
        'deck boards','fence panel','handrail','stair repair','tread replacement',
        'cabinet repair','closet system'],
  '[
    {"signal": "furniture assembly, IKEA assembly, flat-pack assembly, assemble furniture",
     "code": "4001"},
    {"signal": "bed frame assembly, bed frame install",
     "code": "4002"},
    {"signal": "bookshelf assembly, entertainment center assembly, media center",
     "code": "4003"},
    {"signal": "closet organizer installation, closet system install",
     "code": "4004"},
    {"signal": "floating shelves, wall shelves install",
     "code": "4005"},
    {"signal": "built-in cabinet repair, cabinet hinge adjustment, cabinet door alignment",
     "code": "4006"},
    {"signal": "deck board replacement, deck repair, replace decking",
     "code": "4007"},
    {"signal": "fence panel replacement, fence repair",
     "code": "4008"},
    {"signal": "stair repair, step repair, tread replacement",
     "code": "4009"},
    {"signal": "handrail installation, railing install, banister install",
     "code": "4010"}
  ]',
  '[]',
  'For carpentry: fill piece_count with number of pieces or units. Fill linear_feet for trim, handrail, or linear work. Specify material_source (dovetails/client).',
  'Apply difficult_access for stairs, tight closets, or work requiring awkward positioning. Apply custom_fit for non-standard sizes requiring significant scribing or cutting.',
  5
) ON CONFLICT (trade_key) DO NOTHING;

-- OUTDOOR (6000–6999)
INSERT INTO trades (
  trade_key, display_name, scope_template_category,
  service_code_range_start, service_code_range_end,
  detection_keywords, routing_rules, disambiguation_rules,
  scope_values_guidance, complexity_guidance, sort_order
) VALUES (
  'outdoor', 'Outdoor & Seasonal', 'outdoor_seasonal',
  '6000', '6999',
  ARRAY['outdoor','exterior','gutter','pressure washing','power washing',
        'patio furniture','exterior caulking','weatherstripping','storm window',
        'screen porch','deck cleaning','shed assembly','mailbox','house numbers',
        'seasonal'],
  '[
    {"signal": "gutter cleaning, clean gutters",
     "code": "6001"},
    {"signal": "gutter guard installation, leaf guard",
     "code": "6002"},
    {"signal": "pressure washing, power washing deck or siding",
     "code": "6003"},
    {"signal": "patio furniture assembly, outdoor furniture assembly",
     "code": "6004"},
    {"signal": "shed assembly, prefab shed install",
     "code": "6005"},
    {"signal": "mailbox installation, mailbox repair",
     "code": "6006"},
    {"signal": "house number installation, address numbers",
     "code": "6007"},
    {"signal": "exterior caulking, weatherproofing, sealing windows exterior",
     "code": "6008"},
    {"signal": "storm window installation, storm window removal",
     "code": "6009"},
    {"signal": "screen porch repair, rescreening",
     "code": "6010"}
  ]',
  '[]',
  'For outdoor work: fill area_sqft for pressure washing, linear_feet for gutter or caulking work, height (one_story/two_story) for ladder access.',
  'Apply difficult_access for 2-story or high-roof work requiring an extension ladder. Apply multi_trip if work requires drying between visits (e.g. pressure wash before stain).',
  6
) ON CONFLICT (trade_key) DO NOTHING;

-- MOUNTING (7000–7999)
INSERT INTO trades (
  trade_key, display_name, scope_template_category,
  service_code_range_start, service_code_range_end,
  detection_keywords, routing_rules, disambiguation_rules,
  scope_values_guidance, complexity_guidance, sort_order
) VALUES (
  'mounting', 'Mounting & Installs', 'mounting_installs',
  '7000', '7999',
  ARRAY['mount','mounting','TV mount','TV installation','TV wall mount','picture hanging',
        'gallery wall','mirror mount','curtain rod','blinds install','shade install',
        'towel bar','toilet paper holder','grab bar','baby gate','closet rod',
        'whiteboard mount','bulletin board'],
  '[
    {"signal": "TV mounting, mount TV, TV wall install",
     "code": "7001"},
    {"signal": "curtain rod installation, curtain hardware",
     "code": "7002"},
    {"signal": "blind installation, shade installation, window treatment",
     "code": "7003"},
    {"signal": "mirror mounting, heavy mirror wall mount",
     "code": "7004"},
    {"signal": "picture hanging, gallery wall, artwork hanging, frame install",
     "code": "7005"},
    {"signal": "whiteboard installation, bulletin board mounting",
     "code": "7006"},
    {"signal": "baby gate installation, safety gate",
     "code": "7007"},
    {"signal": "grab bar installation, safety bar, bathroom assist bar",
     "code": "7008"},
    {"signal": "towel bar installation, toilet paper holder, bathroom accessories",
     "code": "7009"},
    {"signal": "closet rod installation, closet bar",
     "code": "7010"}
  ]',
  '[]',
  'For mounting: fill mount_count with number of items. Specify wall_type (drywall/plaster/brick/concrete/tile) if mentioned.',
  'Apply difficult_access when mounting location requires anchoring into concrete, tile, or plaster — use toggle bolts, surface mounts, or added backing as needed.',
  7
) ON CONFLICT (trade_key) DO NOTHING;

-- GENERAL REPAIRS (1000–1999)
INSERT INTO trades (
  trade_key, display_name, scope_template_category,
  service_code_range_start, service_code_range_end,
  extra_code_notes,
  detection_keywords, routing_rules, disambiguation_rules,
  scope_values_guidance, complexity_guidance, sort_order
) VALUES (
  'general_repairs', 'General Repairs', 'general_repairs',
  '1000', '1999',
  '(also 9002 for advanced skim coat / level-5 finish on walls or ceilings)',
  ARRAY['drywall','drywall patch','hole in wall','door adjustment','door sticking',
        'door hinge','door slab','window repair','caulking interior','baseboard',
        'trim repair','crown molding','weatherstripping interior','door hardware'],
  '[
    {"signal": "small drywall patch under 6 inches, nail hole, small wall hole",
     "code": "1001"},
    {"signal": "drywall patch 6 to 12 inches, medium wall hole",
     "code": "1002"},
    {"signal": "large drywall patch over 12 inches",
     "code": "1003"},
    {"signal": "drywall patch with texture match, texture blending on wall",
     "code": "1004"},
    {"signal": "door slab replacement",
     "code": "1005"},
    {"signal": "door adjustment, door sticking, door hinge, door not latching",
     "code": "1006"},
    {"signal": "storm door installation, screen door installation",
     "code": "1008"},
    {"signal": "baseboard replacement, trim replacement, baseboard install",
     "code": "1011"},
    {"signal": "crown molding installation, crown molding repair",
     "code": "1012"}
  ]',
  '[
    {"trigger": "skim coat",
     "map_to": "9002",
     "not_when": "flooring context",
     "reason": "skim coat on a wall or ceiling = drywall level-5 or advanced plaster, use 9002"}
  ]',
  'For general repairs: fill repair_count and repair_type. For drywall work, fill drywall_sqft.',
  'Apply difficult_access for drywall work at height or in tight spaces. Apply old_house_risk for pre-1978 homes with plaster walls or horsehair-plaster construction.',
  8
) ON CONFLICT (trade_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Production rates: Plumbing
-- ---------------------------------------------------------------------------

-- Units/day = 8 hours ÷ typical_labor_hours per fixture (rounded conservatively)

INSERT INTO production_rates (service_code, scope_component_key, base_rate, rate_unit, notes) VALUES
  ('2001', 'fixture_count', 6, 'units_per_day',
   'Faucet replacement: ~80 min per fixture — shutoff, remove, install, reconnect supply lines, test.'),
  ('2002', 'fixture_count', 12, 'units_per_day',
   'Showerhead swap: ~40 min per head — pipe tape, thread, flow test.'),
  ('2003', 'fixture_count', 10, 'units_per_day',
   'Toilet flapper/fill valve: ~50 min per toilet — shutoff, drain, replace parts, refill, test.'),
  ('2005', 'fixture_count', 3, 'units_per_day',
   'Full toilet swap: ~2.5 hours per unit — remove, set wax ring, set new toilet, seat, bolt caps, test.'),
  ('2006', 'fixture_count', 6, 'units_per_day',
   'P-trap replacement: ~80 min per sink — remove, size new trap, reassemble, test for leaks.'),
  ('2007', 'fixture_count', 4, 'units_per_day',
   'Garbage disposal install: ~2 hours — mounting bracket, wiring tap, drain stub reconnect, test.')
ON CONFLICT (service_code, scope_component_key) DO NOTHING;

INSERT INTO production_rate_modifiers (service_code, complexity_factor_key, modifier_pct, notes) VALUES
  ('2001', 'difficult_access', -0.25, 'Tight under-sink or crawlspace access — add significant time for body positioning and tool clearance'),
  ('2005', 'difficult_access', -0.20, 'Tight bathroom or awkward angle on soil pipe flange'),
  ('2007', 'difficult_access', -0.20, 'Tight under-sink with disposer mounting bracket and wiring in cramped space')
ON CONFLICT (service_code, complexity_factor_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Production rates: Carpentry
-- ---------------------------------------------------------------------------

INSERT INTO production_rates (service_code, scope_component_key, base_rate, rate_unit, notes) VALUES
  ('4001', 'piece_count', 7, 'units_per_day',
   'Flat-pack furniture assembly: ~70 min per piece at moderate complexity.'),
  ('4002', 'piece_count', 7, 'units_per_day',
   'Bed frame assembly: ~70 min per frame for standard consumer frames.'),
  ('4003', 'piece_count', 5, 'units_per_day',
   'Bookshelf/entertainment center: ~95 min per unit at standard complexity.'),
  ('4004', 'piece_count', 4, 'units_per_day',
   'Closet organizer: ~2 hours per closet system including layout, level, wall anchors.'),
  ('4005', 'piece_count', 9, 'units_per_day',
   'Floating shelf pair: ~55 min — locate studs, mark, drill, mount bracket, hang shelf, level, load test.'),
  ('4007', 'piece_count', 5, 'units_per_day',
   'Deck board set (~3 boards): ~95 min — pry, assess, cut new boards, fasten, sand exposed ends.'),
  ('4009', 'piece_count', 4, 'units_per_day',
   'Stair/step repair: ~2 hours per step — remove tread, assess, cut new, fasten, trim reveal.'),
  ('4010', 'piece_count', 4, 'units_per_day',
   'Handrail installation: ~2 hours per straight run — mark brackets, drill, fasten rail, load test.')
ON CONFLICT (service_code, scope_component_key) DO NOTHING;

INSERT INTO production_rate_modifiers (service_code, complexity_factor_key, modifier_pct, notes) VALUES
  ('4003', 'custom_fit', -0.20, 'Non-standard dimensions requiring cuts or scribing to fit the space'),
  ('4004', 'custom_fit', -0.25, 'Non-standard closet requiring custom rod/shelf cuts and extra layout time'),
  ('4009', 'difficult_access', -0.20, 'Tight stair profile or open-riser design with limited clearance'),
  ('4010', 'difficult_access', -0.15, 'Irregular wall or stair angle requiring custom bracket positioning')
ON CONFLICT (service_code, complexity_factor_key) DO NOTHING;
