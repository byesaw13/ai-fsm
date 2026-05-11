-- Price Book Enrichment Seed
-- Backfills labor hour bands, scope descriptions, exclusions, legal flags,
-- and flags for all existing items. Adds new items from Dovetails Pricing Framework.
-- Safe to re-run: all statements use ON CONFLICT or UPDATE by code.

-- ---------------------------------------------------------------------------
-- Legal flag updates: plumbing (MA gray — fixture swaps are in legal gray zone)
-- ---------------------------------------------------------------------------

UPDATE price_book SET legal_status_ma = 'gray', legal_status_nh = 'legal'
  WHERE code IN ('2001','2002','2005','2006','2007');

UPDATE price_book SET legal_status_ma = 'restricted', legal_status_nh = 'legal'
  WHERE code IN ('2008','2009');

-- ---------------------------------------------------------------------------
-- Legal flag updates: electrical (MA gray — fixture/device swaps tolerated)
-- ---------------------------------------------------------------------------

UPDATE price_book SET legal_status_ma = 'gray', legal_status_nh = 'legal'
  WHERE code IN ('3001','3002','3003','3004','3005','3006','3007','3009');

UPDATE price_book SET legal_status_ma = 'restricted', legal_status_nh = 'gray'
  WHERE code IN ('3010','3012');

-- ---------------------------------------------------------------------------
-- Quote trigger: open-ended specialty items that need a custom quote
-- ---------------------------------------------------------------------------

UPDATE price_book SET quote_trigger = true
  WHERE code IN ('1003','1004','5005','5006','5010','9001','9002','9003','9004','9005');

-- ---------------------------------------------------------------------------
-- Two-person required
-- ---------------------------------------------------------------------------

UPDATE price_book SET two_person_required = true
  WHERE code IN ('1008','3002','5004','5005','6005','7011');

-- ---------------------------------------------------------------------------
-- General Repairs (1000s): labor bands + scope/exclusions
-- ---------------------------------------------------------------------------

UPDATE price_book SET
  labor_hours_low = 0.50, labor_hours_typical = 1.00, labor_hours_high = 1.50,
  scope_description = 'Fast-dry compound patch, sand flush, prime coat. Covers nail pops, dents, small holes up to 6 inches.',
  excluded_items = 'Texture matching, finish painting, holes requiring backing board'
  WHERE code = '1001';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 2.00, labor_hours_high = 3.00,
  scope_description = 'California patch or backer board, mesh tape, two coats compound, sand, prime. Return visit to sand/finish after drying.',
  excluded_items = 'Texture matching, finish painting, holes larger than 12 inches'
  WHERE code = '1002';

UPDATE price_book SET
  labor_hours_low = 2.00, labor_hours_typical = 4.00, labor_hours_high = 6.00,
  scope_description = 'Wood backing or metal clip, drywall panel cut, tape, multiple mud coats over 2–4 days. Includes return visits for coats and sanding.',
  excluded_items = 'Texture matching, finish painting, concealed structural damage'
  WHERE code = '1003';

UPDATE price_book SET
  labor_hours_low = 3.00, labor_hours_typical = 4.50, labor_hours_high = 7.00,
  scope_description = 'Full repair plus texture blending — orange peel, knockdown, or skip trowel. Multiple visits for drying between coats.',
  excluded_items = 'Popcorn ceiling texture, finish painting, custom artistic textures'
  WHERE code = '1004';

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.50, labor_hours_high = 4.00,
  scope_description = 'Remove existing slab, transfer hinges and hardware to new slab, hang and adjust. Customer provides door.',
  excluded_items = 'Frame repair, casing replacement, new lockset (priced separately)'
  WHERE code = '1005';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 1.00,
  scope_description = 'Hinge tightening, plane rubbing edge, or stop adjustment to correct binding or latching issues.',
  excluded_items = 'Frame damage, door replacement, threshold replacement'
  WHERE code = '1006';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 1.00,
  scope_description = 'Remove old hardware, install new lock, handle, or hinge set. Includes one unit; additional at discounted add-on.',
  excluded_items = 'Door realignment, deadbolt rekeying, smart lock wiring'
  WHERE code = '1007';

UPDATE price_book SET
  labor_hours_low = 2.00, labor_hours_typical = 3.00, labor_hours_high = 5.00,
  scope_description = 'Full installation including frame measurement, shimming, alignment, closer/chain adjustment. Two-person job. Customer provides door.',
  excluded_items = 'Frame rebuild, screen replacement (priced separately), painting'
  WHERE code = '1008';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Replace broken latch, tighten loose lock, or realign window sash to latch properly.',
  excluded_items = 'Window sash replacement, glass repair, frame rot'
  WHERE code = '1009';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Cut and install standard fiberglass or aluminum mesh in existing frame. Includes one screen; additional at discounted rate.',
  excluded_items = 'Frame replacement, spline track repair beyond standard wear'
  WHERE code = '1010';

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.00, labor_hours_high = 3.00,
  scope_description = 'Remove old trim, cut and install new painted or primed trim, nail and caulk. Covers ~10 linear feet; larger runs quoted per foot.',
  excluded_items = 'Painting trim (priced separately), complex coped joints beyond standard'
  WHERE code = '1011';

UPDATE price_book SET
  labor_hours_low = 2.00, labor_hours_typical = 3.00, labor_hours_high = 5.00,
  scope_description = 'Measure, cut, cope, and install crown to standard flat ceiling. Covers up to 25 ft base; additional at per-foot rate.',
  excluded_items = 'Vaulted or cathedral ceilings, painting, compound angles beyond 45-degree'
  WHERE code = '1012';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.50,
  scope_description = 'Level and install chair rail up to 25 linear feet; additional at per-foot rate. Includes nailing and caulk.',
  excluded_items = 'Painting, inside or outside corner trim beyond standard splices'
  WHERE code = '1013';

-- ---------------------------------------------------------------------------
-- Plumbing (2000s)
-- ---------------------------------------------------------------------------

UPDATE price_book SET
  labor_hours_low = 0.75, labor_hours_typical = 1.25, labor_hours_high = 2.50,
  scope_description = 'Shut off supply valves, remove old faucet, install new unit with supply lines. Basic swap on existing rough-in.',
  excluded_items = 'Supply valve replacement, drain work, new plumbing runs, garbage disposal'
  WHERE code = '2001';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Unscrew old showerhead, thread tape and install new head. Includes flow restrictor adjustment.',
  excluded_items = 'Valve cartridge, arm replacement, shower door'
  WHERE code = '2002';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 1.00,
  scope_description = 'Replace toilet flapper, fill valve, or both. Includes shut off, drain, install, and flush test.',
  excluded_items = 'Full toilet replacement, supply valve, floor flange'
  WHERE code = '2003';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.25, labor_hours_high = 0.50,
  scope_description = 'Remove old seat and cover, install new seat including bolts and caps.',
  excluded_items = 'Toilet replacement, soft-close hinge adjustment beyond 15 minutes'
  WHERE code = '2004';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.50,
  scope_description = 'Shut off water, drain tank and bowl, remove old toilet and wax ring, set new toilet and wax ring, reconnect supply. Customer provides toilet.',
  excluded_items = 'Flange repair, floor rot, bidet seat wiring, supply valve'
  WHERE code = '2005';

UPDATE price_book SET
  labor_hours_low = 0.75, labor_hours_typical = 1.00, labor_hours_high = 1.50,
  scope_description = 'Remove old P-trap and drain hardware, clean drain stub, install new P-trap and slip-joint drain with compression fittings.',
  excluded_items = 'Drain line rerouting, in-wall pipe repair, faucet replacement'
  WHERE code = '2006';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.00,
  scope_description = 'Remove old unit, install new disposal with mounting assembly, reconnect drain and wire to existing outlet. New outlet not included.',
  excluded_items = 'New electrical outlet, dishwasher drain tie-in, P-trap replacement'
  WHERE code = '2007';

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.00, labor_hours_high = 3.00,
  scope_description = 'Connect appliance to existing water supply and drain stub. Includes door panel alignment if straightforward.',
  excluded_items = 'New plumbing rough-in, electrical circuit, cabinet modification'
  WHERE code = '2008';

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.00, labor_hours_high = 3.00,
  scope_description = 'Connect supply hoses (hot/cold), drain hose to existing standpipe, and dryer vent to existing wall cap.',
  excluded_items = 'Gas line connection, new plumbing rough-in, new 240V electrical circuit'
  WHERE code = '2009';

UPDATE price_book SET
  labor_hours_low = 0.75, labor_hours_typical = 1.00, labor_hours_high = 1.50,
  scope_description = 'Visual and functional inspection of exposed plumbing — supply lines, drain connections, shutoffs, and visible pipe sections.',
  excluded_items = 'Camera inspection, wall opening, pressure testing, slab leaks'
  WHERE code = '2010';

-- ---------------------------------------------------------------------------
-- Electrical (3000s)
-- ---------------------------------------------------------------------------

UPDATE price_book SET
  labor_hours_low = 0.50, labor_hours_typical = 0.75, labor_hours_high = 1.50,
  scope_description = 'Shut off breaker, remove old fixture, wire and mount new fixture on existing box. Like-for-like swap.',
  excluded_items = 'New wiring run, junction box relocation, canopy cover-up rings for larger fixtures'
  WHERE code = '3001';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.50,
  scope_description = 'Remove old fan or fixture, confirm fan-rated box, wire new fan with light kit per manufacturer. Two-person job for safe lift.',
  excluded_items = 'New fan-rated box ($85 add-on if needed), new wiring run, remote/smart controls'
  WHERE code = '3002';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Shut off breaker, remove old device, install new outlet or switch, restore cover plate. Like-for-like only.',
  excluded_items = 'New circuit, GFCI upgrade, USB outlets (priced as add-on)'
  WHERE code = '3003';

UPDATE price_book SET
  labor_hours_low = 0.50, labor_hours_typical = 0.75, labor_hours_high = 1.00,
  scope_description = 'Shut off breaker, remove standard outlet, install GFCI outlet with proper line/load wiring and test button verification.',
  excluded_items = 'New wiring run, panel work, whole-circuit GFCI breaker'
  WHERE code = '3004';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Remove existing switch, install compatible dimmer with proper wiring. Standard incandescent or LED-compatible dimmers only.',
  excluded_items = 'Multi-way dimmer wiring, smart dimmer app setup, rewiring 3-way circuits'
  WHERE code = '3005';

UPDATE price_book SET
  labor_hours_low = 0.75, labor_hours_typical = 1.00, labor_hours_high = 1.50,
  scope_description = 'Mount doorbell unit at existing wiring location or battery install, configure Wi-Fi pairing and app setup.',
  excluded_items = 'New wiring run for wired doorbells, chime replacement, transformer upgrade'
  WHERE code = '3006';

UPDATE price_book SET
  labor_hours_low = 0.50, labor_hours_typical = 1.00, labor_hours_high = 1.50,
  scope_description = 'Remove existing thermostat, install new smart thermostat using existing C-wire or adapter. Configure app pairing and schedule.',
  excluded_items = 'New C-wire run, HVAC system repairs, multi-zone configuration'
  WHERE code = '3007';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Mount and install battery or plug-in smoke/CO detectors per NFPA placement guidelines. Hardwired versions priced as Standard.',
  excluded_items = 'Hardwired interconnected systems, panel replacement, alarm monitoring setup'
  WHERE code = '3008';

UPDATE price_book SET
  labor_hours_low = 0.75, labor_hours_typical = 1.00, labor_hours_high = 1.50,
  scope_description = 'Mount motion sensor at wall or eave, wire to existing switch loop or outlet. Configure sensitivity and range.',
  excluded_items = 'New wiring runs, conduit installation, smart-home hub integration'
  WHERE code = '3009';

UPDATE price_book SET
  labor_hours_low = 2.00, labor_hours_typical = 3.00, labor_hours_high = 5.00,
  scope_description = 'Mount and wire low-voltage LED strip or plug-in puck lights under cabinets. Includes concealed wiring to power source.',
  excluded_items = 'New dedicated circuit, dimmable switch wiring, hard-wired line-voltage systems'
  WHERE code = '3010';

-- ---------------------------------------------------------------------------
-- Carpentry & Furniture (4000s)
-- ---------------------------------------------------------------------------

UPDATE price_book SET
  labor_hours_low = 0.75, labor_hours_typical = 1.00, labor_hours_high = 2.00,
  scope_description = 'Assemble one standard flat-pack piece per manufacturer instructions. Includes hardware sorting and leveling.',
  excluded_items = 'Wall anchoring (priced separately), touch-up painting, delivery placement'
  WHERE code = '4001';

UPDATE price_book SET
  labor_hours_low = 0.75, labor_hours_typical = 1.00, labor_hours_high = 1.50,
  scope_description = 'Assemble headboard, frame rails, slats, and legs. Includes center support adjustment.',
  excluded_items = 'Mattress placement, old frame disposal, custom platform modifications'
  WHERE code = '4002';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.50,
  scope_description = 'Assemble bookshelf, entertainment center, or TV stand from flat-pack. Includes leveling and cable pass-through routing.',
  excluded_items = 'Wall anchoring, TV mounting, cable management raceway'
  WHERE code = '4003';

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.00, labor_hours_high = 3.50,
  scope_description = 'Install one standard modular closet system including rods, shelves, and brackets to studs or wall anchors.',
  excluded_items = 'Custom built-in carpentry, painting, closet door replacement'
  WHERE code = '4004';

UPDATE price_book SET
  labor_hours_low = 0.50, labor_hours_typical = 0.75, labor_hours_high = 1.50,
  scope_description = 'Locate studs or use appropriate anchors, mount up to 2 floating shelves level and secure.',
  excluded_items = 'Painting, decorative trim, weight-bearing shelves beyond 50 lbs'
  WHERE code = '4005';

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.00, labor_hours_high = 4.00,
  scope_description = 'Diagnose and correct hinge adjustment, door alignment, drawer slide replacement, or minor cabinet carpentry repairs.',
  excluded_items = 'Cabinet box replacement, painting, countertop work'
  WHERE code = '4006';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.50,
  scope_description = 'Remove rotted or damaged deck boards, cut and install replacement boards, fasten with appropriate screws. Up to 3 boards; additional at add-on rate.',
  excluded_items = 'Joist repair, ledger board, railing work, staining (priced separately)'
  WHERE code = '4007';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.50,
  scope_description = 'Remove damaged panel, install replacement panel on existing posts. Includes one panel; additional quoted per section.',
  excluded_items = 'Post replacement, concrete work, painting or staining'
  WHERE code = '4008';

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.00, labor_hours_high = 3.50,
  scope_description = 'Repair or replace one stair tread or riser. Includes securing loose treads and addressing squeaks.',
  excluded_items = 'Full stair rebuild, railing replacement, carpet removal'
  WHERE code = '4009';

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.00, labor_hours_high = 3.00,
  scope_description = 'Install one straight wall-mounted handrail up to 8 linear feet with code-compliant brackets and returns.',
  excluded_items = 'Custom curved rails, metal fabrication, full baluster system'
  WHERE code = '4010';

-- ---------------------------------------------------------------------------
-- Painting & Finishes (5000s)
-- ---------------------------------------------------------------------------

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.00, labor_hours_high = 3.00,
  scope_description = 'Prep, cut-in, and roll one accent wall up to 150 sq ft — two coats. Includes tape and drop cloth.',
  excluded_items = 'Primer coat on new drywall, ceiling, trim painting, wallpaper removal'
  WHERE code = '5001';

UPDATE price_book SET
  labor_hours_low = 0.50, labor_hours_typical = 1.00, labor_hours_high = 1.50,
  scope_description = 'Light sand, prime bare spots, brush two coats on both sides of one interior door and casing.',
  excluded_items = 'Stripping old paint, door hardware removal/reinstall, exterior doors'
  WHERE code = '5002';

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.00, labor_hours_high = 3.00,
  scope_description = 'Lightly sand, caulk gaps, brush two coats on ~50 linear feet of baseboard or trim.',
  excluded_items = 'Trim replacement, painting walls or ceiling, staining'
  WHERE code = '5003';

UPDATE price_book SET
  labor_hours_low = 3.00, labor_hours_typical = 4.00, labor_hours_high = 6.00,
  scope_description = 'Pressure wash, light scrape, prime bare wood, apply one coat stain/paint on up to 100 linear feet of fence. Two-person job.',
  excluded_items = 'Fence repair, second coat (add-on), stain sealer on wet wood'
  WHERE code = '5004';

UPDATE price_book SET
  labor_hours_low = 3.50, labor_hours_typical = 5.00, labor_hours_high = 8.00,
  scope_description = 'Sweep, sand rough spots, apply brightener/cleaner, apply one coat deck stain or sealer on up to 200 sq ft. Two-person job.',
  excluded_items = 'Pressure washing (add-on), board replacement, second coat, railings'
  WHERE code = '5005';

UPDATE price_book SET
  labor_hours_low = 3.00, labor_hours_typical = 4.00, labor_hours_high = 8.00,
  scope_description = 'Remove hardware, degloss, prime, and brush/spray two coats on up to 10 cabinet faces.',
  excluded_items = 'Box painting, interior shelf painting, full kitchen quoted separately'
  WHERE code = '5006';

UPDATE price_book SET
  labor_hours_low = 3.00, labor_hours_typical = 4.00, labor_hours_high = 6.00,
  scope_description = 'Scrape loose paint, prime bare wood, apply two coats on exterior walls of shed up to 120 sq ft. Excludes roof.',
  excluded_items = 'Roof painting, floor painting, windows or doors (add-on)'
  WHERE code = '5007';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Spot prime and brush touch-up on dry patches up to 6 inches. Same-day if patch is already cured.',
  excluded_items = 'Unprimed drywall, texture areas, full wall repainting'
  WHERE code = '5008';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.00,
  scope_description = 'Return-visit touch-up painting on patches larger than 6 inches once drywall is fully cured. Feather-blends to surrounding surface.',
  excluded_items = 'Full wall painting, texture matching, unprimed surfaces'
  WHERE code = '5009';

UPDATE price_book SET
  labor_hours_low = 5.00, labor_hours_typical = 6.00, labor_hours_high = 10.00,
  scope_description = 'Full acid etch or diamond grind, two-part epoxy base coat, color chips broadcast, topcoat seal on up to 150 sq ft.',
  excluded_items = 'Crack injection, oil remediation, areas larger than 150 sq ft (quoted separately)'
  WHERE code = '5010';

UPDATE price_book SET
  labor_hours_low = 0.50, labor_hours_typical = 0.75, labor_hours_high = 1.50,
  scope_description = 'Cut and remove old caulk, clean surface, apply new bead of appropriate caulk (silicone, latex, or paintable) on one window, tub perimeter, or joint run.',
  excluded_items = 'Grout replacement, tile repair, mold remediation behind substrate'
  WHERE code = '5011';

-- ---------------------------------------------------------------------------
-- Outdoor & Seasonal (6000s)
-- ---------------------------------------------------------------------------

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.50,
  scope_description = 'Clear debris from gutters, flush downspouts, bag and remove waste. Up to 150 linear feet on single-story structure.',
  excluded_items = 'Two-story cleaning (priced separately), gutter guard install, downspout extensions'
  WHERE code = '6001';

UPDATE price_book SET
  labor_hours_low = 2.00, labor_hours_typical = 3.00, labor_hours_high = 5.00,
  scope_description = 'Install snap-in mesh or reverse-curve gutter guards on existing gutters. Includes trimming to length and securing.',
  excluded_items = 'Gutter repair, fascia board replacement, valley areas'
  WHERE code = '6002';

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.00, labor_hours_high = 3.50,
  scope_description = 'Surface preparation rinse and pressure wash using appropriate PSI setting for deck boards, siding, or concrete up to 200 sq ft.',
  excluded_items = 'Soft wash for delicate surfaces, roof washing, chemical treatment'
  WHERE code = '6003';

UPDATE price_book SET
  labor_hours_low = 0.75, labor_hours_typical = 1.00, labor_hours_high = 2.00,
  scope_description = 'Assemble one outdoor dining set: table and up to four chairs from manufacturer packaging.',
  excluded_items = 'Umbrella assembly, cover installation, concrete anchoring'
  WHERE code = '6004';

UPDATE price_book SET
  labor_hours_low = 4.00, labor_hours_typical = 5.00, labor_hours_high = 8.00,
  scope_description = 'Assemble pre-fabricated shed kit on existing level surface up to 8×10 ft. Two-person job. Includes door hang and latch install.',
  excluded_items = 'Foundation/gravel pad, anchoring to concrete, electrical, painting'
  WHERE code = '6005';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 1.00,
  scope_description = 'Install new mailbox post and box, or repair/re-mount existing. Concrete footing not included.',
  excluded_items = 'Concrete work, post-hole digging beyond 12 inches, painting'
  WHERE code = '6006';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.25, labor_hours_high = 0.50,
  scope_description = 'Mount one set of house numbers at eye-level position using appropriate fasteners for siding or brick.',
  excluded_items = 'Illuminated numbers, custom engraving, mailbox post numbers'
  WHERE code = '6007';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.50,
  scope_description = 'Cut out deteriorated caulk, clean and dry substrate, apply exterior-grade caulk or backer rod on up to 50 linear feet of siding seams, window perimeters, or trim gaps.',
  excluded_items = 'Siding replacement, rot repair, painting (add-on)'
  WHERE code = '6008';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.50,
  scope_description = 'Measure, fit, and install one storm or combination window. Multi-window jobs discounted.',
  excluded_items = 'Window frame repair, removal and disposal fees, painting'
  WHERE code = '6009';

UPDATE price_book SET
  labor_hours_low = 2.00, labor_hours_typical = 3.00, labor_hours_high = 5.00,
  scope_description = 'Remove old screening, repair or replace spline track as needed, install new screen fabric on one wall section up to 8×10 ft.',
  excluded_items = 'Frame rebuilding, door screen (priced separately), painting or staining'
  WHERE code = '6010';

-- ---------------------------------------------------------------------------
-- Mounting & Installs (7000s)
-- ---------------------------------------------------------------------------

UPDATE price_book SET
  labor_hours_low = 0.75, labor_hours_typical = 1.00, labor_hours_high = 1.50,
  scope_description = 'Locate studs, mount standard fixed or tilting bracket, hang and level TV up to 65 inches. Customer provides mount.',
  excluded_items = 'Full-motion articulating arm, cable concealment, soundbar mounting'
  WHERE code = '7001';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Mark, drill, and install curtain rod brackets with appropriate anchors. Level and mount rod up to 6 ft. One window.',
  excluded_items = 'Curtain hanging, ceiling mount track, bay window treatment'
  WHERE code = '7002';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Measure inside/outside mount, install brackets at proper depth, hang blind or shade and test raise/lower.',
  excluded_items = 'Motorized blinds wiring, custom-cut blinds, plantation shutters'
  WHERE code = '7003';

UPDATE price_book SET
  labor_hours_low = 0.50, labor_hours_typical = 0.75, labor_hours_high = 1.50,
  scope_description = 'Locate studs or use heavy-duty anchors appropriate for mirror weight. Mount level with security check.',
  excluded_items = 'Framing, lighting above mirror, medicine cabinet (priced separately)'
  WHERE code = '7004';

UPDATE price_book SET
  labor_hours_low = 0.50, labor_hours_typical = 0.75, labor_hours_high = 1.50,
  scope_description = 'Mark layout, install appropriate anchors, hang up to 5 framed pieces level and plumb.',
  excluded_items = 'Art framing, custom gallery templates, canvas stretching'
  WHERE code = '7005';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Mount one whiteboard or bulletin board up to 4×6 ft using appropriate wall anchors.',
  excluded_items = 'Projector screen mounting, frameless glass boards'
  WHERE code = '7006';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Install one pressure-mount or hardware-mount baby gate at stairway or doorway opening. Includes safety check.',
  excluded_items = 'Custom-width gates, permanent banister hardware, painting'
  WHERE code = '7007';

UPDATE price_book SET
  labor_hours_low = 0.50, labor_hours_typical = 0.75, labor_hours_high = 1.00,
  scope_description = 'Locate studs or solid blocking, drill pilot holes, mount ADA-spec grab bar with proper lag screws. Includes pull-test verification.',
  excluded_items = 'Blocking installation in finished wall, tile drilling (add-on), painting'
  WHERE code = '7008';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.25, labor_hours_high = 0.50,
  scope_description = 'Mark, drill, and install one towel bar, ring, or toilet paper holder with appropriate anchors.',
  excluded_items = 'Tile drilling (add-on applies), recessed paper holder, heated towel rail wiring'
  WHERE code = '7009';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.50, labor_hours_high = 0.75,
  scope_description = 'Install one closet rod with flanges into studs or with heavy anchors. Up to 6 ft.',
  excluded_items = 'Shelf installation, organizer system, painting'
  WHERE code = '7010';

-- ---------------------------------------------------------------------------
-- Maintenance & Small Jobs (8000s)
-- ---------------------------------------------------------------------------

UPDATE price_book SET
  labor_hours_low = 0.75, labor_hours_typical = 1.00, labor_hours_high = 2.00,
  scope_description = 'Disconnect dryer, brush and vacuum vent duct up to 15 ft, reconnect and verify airflow at exterior cap.',
  excluded_items = 'Duct rerouting, cap replacement (add-on), booster fan install'
  WHERE code = '8001';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.25, labor_hours_high = 0.50,
  scope_description = 'Replace up to 3 HVAC, AC, refrigerator, or range hood filters per customer-provided filters or with matching supplied filters.',
  excluded_items = 'Filter sizing assessment, duct cleaning, HVAC service'
  WHERE code = '8002';

UPDATE price_book SET
  labor_hours_low = 0.50, labor_hours_typical = 0.50, labor_hours_high = 1.00,
  scope_description = 'Remove old weatherstripping, clean channel, and install new foam, V-strip, or door seal on one door or window.',
  excluded_items = 'Door adjustment (priced separately), threshold replacement'
  WHERE code = '8003';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.25, labor_hours_high = 0.50,
  scope_description = 'Trim and attach door sweep to bottom of one interior or exterior door.',
  excluded_items = 'Threshold replacement, door adjustment, automatic door bottom'
  WHERE code = '8004';

UPDATE price_book SET
  labor_hours_low = 0.25, labor_hours_typical = 0.25, labor_hours_high = 0.50,
  scope_description = 'Remove worn closer, install new screen door closer, adjust tension and stop chain.',
  excluded_items = 'Screen door frame repair, screen replacement'
  WHERE code = '8005';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.50,
  scope_description = 'Mount up to 5 wall-mounted bike hooks, tool racks, or shelving tracks in garage. Includes stud location and lag anchoring.',
  excluded_items = 'Overhead ceiling storage, overhead pulley systems, electrical'
  WHERE code = '8006';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 3.00,
  scope_description = 'Remove and replace one damaged siding section up to 3 linear feet, matching profile and caulking joints.',
  excluded_items = 'Painting (add-on), sheathing repair, large siding projects quoted per sq ft'
  WHERE code = '8007';

UPDATE price_book SET
  labor_hours_low = 0.75, labor_hours_typical = 1.00, labor_hours_high = 1.50,
  scope_description = 'Re-mount one pair of decorative shutters or repair hinges and fasteners.',
  excluded_items = 'Painting, shutter fabrication, operational shutters'
  WHERE code = '8008';

UPDATE price_book SET
  labor_hours_low = 1.00, labor_hours_typical = 1.50, labor_hours_high = 2.50,
  scope_description = 'Cut out cracked caulk, clean joint, and apply hydraulic cement or elastomeric sealant on up to 50 linear feet of foundation seams.',
  excluded_items = 'Interior waterproofing, crack injection, structural repairs'
  WHERE code = '8009';

UPDATE price_book SET
  labor_hours_low = 1.50, labor_hours_typical = 2.00, labor_hours_high = 3.00,
  scope_description = 'Install rigid foam or batting insulation on one pull-down attic hatch lid. Includes weatherstrip seal around frame.',
  excluded_items = 'Blown-in insulation, hatch frame replacement, attic air sealing beyond hatch'
  WHERE code = '8010';

-- ---------------------------------------------------------------------------
-- Specialty (9000s): all quote_trigger, no labor hours (scope too variable)
-- ---------------------------------------------------------------------------

UPDATE price_book SET
  scope_description = 'Custom or complex project not covered by standard catalog items. Scope, timeline, and materials determined on-site assessment.',
  excluded_items = 'Structural, permitted, licensed-trade work'
  WHERE code = '9001';

UPDATE price_book SET
  scope_description = 'Full wall skim coat, large-area texture restoration, or complex texture matching across multiple surfaces.',
  excluded_items = 'Finish painting, mold remediation, plaster system reconstruction'
  WHERE code = '9002';

UPDATE price_book SET
  scope_description = 'Whole-home interior, full exterior, or multi-room painting project. Quoted per square foot after on-site measure.',
  excluded_items = 'Carpentry repairs, wallpaper removal (add-on), window glazing'
  WHERE code = '9003';

UPDATE price_book SET
  scope_description = 'Built-in shelving, custom furniture pieces, or unique woodworking. Quoted after design consultation.',
  excluded_items = 'Finishing/staining if contracted separately, structural modifications'
  WHERE code = '9004';

UPDATE price_book SET
  scope_description = 'Porch rebuilds, structural stair replacement, or heavy exterior framing. Requires site assessment and permit review.',
  excluded_items = 'Permits (client responsibility), concrete work, roofing'
  WHERE code = '9005';

UPDATE price_book SET
  scope_description = 'Holiday light installation, large storm prep packages, or seasonal weatherproofing beyond standard catalog scope.',
  excluded_items = 'Roof work, tree trimming, gutter guard install (priced separately)'
  WHERE code = '9006';

-- ---------------------------------------------------------------------------
-- New items from Dovetails Pricing Framework not yet in catalog
-- ---------------------------------------------------------------------------

INSERT INTO price_book (code, name, category, tier, price_min_cents, price_max_cents,
  description, notes, default_labor_hours, requires_materials, upsell_codes,
  labor_hours_low, labor_hours_typical, labor_hours_high,
  scope_description, excluded_items, legal_status_ma, legal_status_nh,
  two_person_required, quote_trigger)
VALUES

-- 1014: Prehung interior door install (full frame + slab)
('1014', 'Prehung interior door installation', 'general_repairs', 'standard',
  39500, 90000,
  'Full prehung unit including shimming, plumbing, nailing, and hardware. Customer provides door.',
  'Price varies by door width and rough opening condition.',
  2.50, false, ARRAY['1011','1005'],
  1.50, 2.50, 4.00,
  'Set new prehung door unit in rough opening, shim level and plumb, nail jambs through shims, install casing, hang door, adjust strike.',
  'Casing painting, deadbolt install, frame rot repair, non-standard rough opening modification',
  'legal', 'legal', false, false),

-- 2011: Water heater flush/maintenance
('2011', 'Water heater flush & inspection', 'plumbing', 'standard',
  22500, 29500,
  'Flush sediment from tank, inspect anode rod and pressure relief valve, check connections.',
  'Standard tank water heaters only. Gas and electric.',
  1.00, false, ARRAY['2010','8002'],
  0.75, 1.00, 1.50,
  'Connect drain hose, open flush valve and drain tank fully, close and refill, inspect T&P valve, check for leaks at connections.',
  'Anode rod replacement (add-on), tankless units, heater relocation, new installations',
  'gray', 'legal', false, false),

-- 3011: USB outlet installation
('3011', 'USB outlet installation', 'electrical', 'standard',
  17500, 22500,
  'Replace standard outlet with USB-A/C combo outlet. Same box, no new wiring.',
  'Like-for-like on existing circuit only.',
  0.75, false, ARRAY['3003','3004'],
  0.50, 0.75, 1.00,
  'Shut off breaker, remove standard outlet, install USB combo receptacle with proper pigtail, restore cover plate.',
  'New circuit, amperage upgrade, USB-C fast-charge circuits requiring dedicated wiring',
  'gray', 'legal', false, false),

-- 3012: Outdoor outlet / GFCI installation
('3012', 'Outdoor GFCI outlet installation', 'electrical', 'specialty',
  39500, NULL,
  'Install weatherproof outdoor GFCI outlet on existing circuit. Includes in-use cover.',
  'MA: restricted — requires licensed electrician for new outdoor rough-in. NH: gray.',
  2.00, true, ARRAY['3004','3009'],
  1.50, 2.00, 3.00,
  'Route wire from interior outlet, install outdoor box with weatherproof in-use cover, wire GFCI outlet, test.',
  'New dedicated circuit from panel, conduit runs exceeding 10 ft, buried conduit',
  'restricted', 'gray', false, false),

-- 4011: Anti-tip furniture anchoring
('4011', 'Anti-tip furniture anchoring', 'carpentry_furniture', 'core',
  15000, 17500,
  'Secure tall furniture (bookcases, dressers, wardrobes) to wall studs with anti-tip straps.',
  'Up to 3 pieces per visit at add-on rate.',
  0.50, false, ARRAY['4001','4004'],
  0.25, 0.50, 0.75,
  'Locate studs, attach L-bracket or strap to furniture top, lag into stud, verify secure.',
  'Furniture assembly (priced separately), drywall anchors on plaster walls beyond standard'
  , 'legal', 'legal', false, false),

-- 6011: Two-story gutter cleaning
('6011', 'Gutter cleaning (2-story, <=150 ft)', 'outdoor_seasonal', 'specialty',
  39500, NULL,
  'Clear gutters and flush downspouts on two-story structure up to 150 linear feet.',
  'Requires extension ladder work. Two-person job for safety.',
  2.50, false, ARRAY['6001','6002','6008'],
  2.00, 2.50, 4.00,
  'Set and reposition extension ladders, clear debris from gutters, flush downspouts, bag and remove waste.',
  'Gutter guard install, fascia repair, roof work beyond ladder reach',
  'legal', 'legal', true, false),

-- 7011: TV mounting >65"
('7011', 'TV mounting (>65")', 'mounting_installs', 'standard',
  29500, 39500,
  'Mount large-format TV 66–85 inches. Two-person lift. Customer provides mount.',
  'VESA compatibility check required before scheduling.',
  1.50, false, ARRAY['7001','7004'],
  1.00, 1.50, 2.00,
  'Verify VESA pattern, locate studs or install blocking plate, mount bracket, two-person lift and hang.',
  'Full-motion arm on plaster or masonry (requires masonry add-on), cable concealment, soundbar'
  , 'legal', 'legal', true, false),

-- 7012: Medicine cabinet installation
('7012', 'Medicine cabinet installation', 'mounting_installs', 'standard',
  25000, 39500,
  'Mount surface-mounted medicine cabinet with mirror. Recessed units priced higher (wall opening required).',
  'Recessed install adds $75-$150 for wall opening and framing.',
  1.50, false, ARRAY['7004','7009'],
  1.00, 1.50, 2.50,
  'Remove old cabinet or mirror, mount new unit plumb and level, reconnect if wired (surface mount only).',
  'Recessed unit framing (add-on), plumbing connections, electrical for lighted units'
  , 'legal', 'legal', false, false),

-- 8011: Bathroom caulk refresh (more specific than 5011)
('8011', 'Bathroom caulk refresh', 'maintenance_small', 'core',
  15000, 19500,
  'Remove old caulk from tub, shower, or sink perimeter and apply fresh silicone bead.',
  'Distinct from 5011 — this is bath-specific silicone, not paintable.',
  0.75, true, ARRAY['5011','7009'],
  0.50, 0.75, 1.25,
  'Score and remove old caulk with oscillating tool, clean substrate with alcohol, apply 100% silicone bead, smooth and cure.',
  'Tile repair, grout replacement, mold behind substrate'
  , 'legal', 'legal', false, false),

-- 8012: Garage door lube & adjustment
('8012', 'Garage door lube & adjustment', 'maintenance_small', 'core',
  15000, 17500,
  'Lubricate hinges, rollers, springs, and tracks; adjust travel limits and force settings.',
  'Does not include spring replacement (licensed garage door service recommended).',
  0.50, true, ARRAY['8001','8003'],
  0.50, 0.50, 0.75,
  'Apply lithium grease to all hinges, rollers, and springs; WD-40 tracks; test balance and adjust opener force/travel settings.',
  'Spring replacement or repair, cable replacement, panel replacement'
  , 'legal', 'legal', false, false),

-- 8013: Smoke/CO detector battery replacement & test
('8013', 'Smoke/CO detector check & battery swap', 'maintenance_small', 'core',
  15000, 15000,
  'Test all smoke/CO detectors, replace batteries, replace units older than 10 years.',
  'Batteries included. Hardwired units tested at test button.',
  0.50, true, ARRAY['3008','8002'],
  0.50, 0.50, 0.75,
  'Test each detector, replace AA/9V batteries, flag any units past 10-year manufacture date for replacement.',
  'Hardwired interconnect wiring repair, alarm monitoring system'
  , 'legal', 'legal', false, false)

ON CONFLICT (code) DO NOTHING;
