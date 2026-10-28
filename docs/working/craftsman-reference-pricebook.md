# Craftsman reference for the Dovetails price book

Status: **reference draft for owner review** (2026-10-27). Nothing in the app or database has changed.
Replaces the 10-code pilot sheet from earlier the same day.

## Source and limits

- Craftsman National Estimator Cloud (owner subscription). Read through the app's own search, one topic
  at a time, for topics that match a Dovetails price book code. Not a bulk copy of the books.
- Books used:
  - **RIR**: *National Renovation & Insurance Repair Estimator*. **Primary source.** It is priced for
    repair work and has removal lines, "remove and reinstall" lines and per-trade minimum charges.
  - **R&R**: *2026 National Repair & Remodeling Estimator*, 49th ed. Small-volume (SV) column used.
  - **EL**: *National Electrical Estimator*. New-construction device times.
  - **PA**: *National Painting Cost Estimator*. Production rates, "Medium" crew used.
  - **FC**: *Framing & Finish Carpentry*. Only a few rows used.
- Raw captures (licensed data) are kept **outside git** in `~/craftsman-reference/` on garonhome:
  - `raw2/`: one file per search.
  - `corpus.tsv`: every row, deduplicated.
  - `by_code.txt`: rows sorted under each price book code.
- ROADMAP excludes "licensed Craftsman import activation". Using any of this in the app needs a backlog
  task first (see the end).

## How to read the numbers

- `1C@.215` means **0.215 worker-hours per unit** for crew 1C. Hours are total worker-hours, not crew size.
- **RIR "replace" means install the new item only. "remove" is a separate line.** For a like-for-like
  swap, add the two: **swap = replace + remove**. "Remove for work, then reinstall" is a pull-and-reset
  of the same item (for example, pulling a toilet to lay a floor).
- No line in any book includes drive time, trip charge or setup. RIR covers this with
  **minimum charge** lines (below).
- Labor dollars in RIR are fully burdened, close to what you bill. Implied rates:
  - carpenter (1C) ~$82/hr
  - plumber (7P) ~$94/hr
  - electrician (9E) ~$77/hr
  - painter (5F) ~$79/hr
  - flooring (5I) ~$70/hr
  - demolition laborer (1D) ~$57/hr

  For comparison, the R&R book's rates are base wages only, about $46 to $51/hr.
- Material prices are national averages, updated quarterly (last update 2026-09-30). They are a sanity
  check against our receipts, not our cost.

## Minimum charges (RIR): the small-job floor

These are the most useful lines for a handyman book. Each is the smallest job Craftsman would price for
that trade, in hours.

| Trade | Min hours | Min total $ (mat + labor) |
|---|---|---|
| Drywall repair | **6.50** (6D crew) | $569 |
| Acoustic ceiling texture | 1.25 | $448 |
| Painting | **3.00** | $309 |
| Tile floor / vinyl floor | 3.00 | $333 to $346 |
| Tile countertop | 1.96 | $213 |
| Siding repair (incl. fiber-cement, shingle) | 3.00 to 3.25 | $297 to $353 |
| Wood fence | 1.75 | $198 |
| Window awning | 1.85 | $250 |
| Concrete patch / spall repair | 1.00 | $167 |
| Exterior plumbing line work | 10.0 | $1,192 |

Takeaway: our 1.0 to 1.5 h small-job times are well under Craftsman's per-trade minimums. That supports
holding a firm trip/minimum charge on every small job.

## Side by side, every code

Dovetails hours are low / typical / high from `price_book` (prod, read 2026-10-27). Craftsman hours are
for one unit unless a unit is shown. "Swap" = replace + remove.

### 1xxx: General repairs, doors, windows, trim

| Code | Dovetails item | Dovetails hrs | Craftsman (book: line) | Craftsman hrs | Notes / what's included |
|---|---|---|---|---|---|
| 1001 | Drywall patch <=6" | 0.75 / 1.0 / 1.5 | RIR: drywall patch (match existing texture or finish) | **1.42** ea | Material ~$94. Min charge for drywall repair is 6.5 h. Ours is lean, but defensible for a nail-pop/dent. |
| 1002 | Drywall patch 6-12" | 1.5 / 2.0 / 2.5 | RIR: drywall patch | 1.42 ea + texture | Craftsman uses the same patch line regardless of size. Add texture per SF (below). |
| 1003 | Drywall patch >12" | 2.5 / 3.5 / 4.5 | RIR: 1/2" drywall installed, per SF | 0.028 (no texture) to 0.041 (smooth-wall) /SF | Includes board, mud, screws, tape, corner bead. 4x4 ft = 0.45 to 0.66 h plus drying trips. R&R tape & bed repaired joints: 0.023/SF. |
| 1004 | Patch w/ texture match | 3.5 / 4.5 / 6.0 | RIR: texture drywall | light hand 0.005, heavy 0.006, smooth-wall 0.012 /SF | Texture is cheap in hours. Ours is driven by multi-visit drying, not texture labor. |
| 1005 | Door slab replacement | 2.0 / 2.5 / 3.0 | RIR: interior door, in existing jamb | **0.215** + remove 0.217 | RIR assumes a pre-hung-ready slab. FC: set 3 hinges and hang door in existing frame **1.45** h is the realistic slab-fitting number. Ours fits. |
| 1006 | Door adjustment | 0.75 / 1.0 / 1.5 | none (method text only) | none | Method notes: plane 1/8" at scuff, reset hinge depth, shim/move strike, seal edges. |
| 1007 | Door hardware replacement | 0.75 / 1.0 / 1.5 | RIR: interior lockset / exterior lockset / deadbolt | **0.405 / 0.461 / 0.678** + remove 0.28 | Interior lockset swap 0.69 h. Deadbolt swap 0.95 h. Hinges (storm door) 0.342. |
| 1008 | Storm/screen door install | 4.0 / 5.0 / 6.0 | RIR: storm/screen door (incl. jamb & hinges) | **1.21** | R&R SV: **4.92** h (2-carpenter crew, includes hardware, closer, threshold). Wide gap. Ours matches R&R. |
| 1009 | Window lock/latch repair | 0.5 / 0.75 / 1.0 | none | none | Only antique sash: rehang sash weight 2.27 h, recondition 2.08 h. |
| 1010 | Window screen replace/repair | 0.5 / 0.75 / 1.25 | RIR: window screen (aluminum frame, made to match) | **0.125** ea | Material $21 to $40 by size. Ours includes measure/order trip. |
| 1011 | Baseboard & trim replacement | 1.5 / 2.0 / 2.5 | RIR: clamshell base 1-1/2" to 3-1/2" | **0.038 /LF** | Finger-joint pine $3.46 to $5.67/LF. Remove molding at base (R&R SV): 0.022/LF. 30 LF swap is about 1.8 h. Buy-minimum: RIR prices a full 8' stick even for a short repair. |
| 1012 | Crown molding | 3.0 / 4.0 / 5.0 | RIR: crown mold (all species) | **0.046 /LF** (0.098 for complex profiles) | Paint-grade pine $8.39/LF; 4-1/2" crown $12.30/LF. 60 LF room = 2.8 h simple, 5.9 h complex. |
| 1013 | Chair rail | 1.5 / 2.25 / 3.0 | RIR: chair rail | **0.038 /LF** | Paint-grade pine $6.56 to $8.29/LF. Remove & reinstall 0.065/LF. |
| 1014 | Full-frame window replacement | 3.5 / 4.5 / 5.5 | not captured | none | Window chapter not reached by our searches; follow up. |
| 1015 | Window rough-opening adder | 0.75 / 1.0 / 1.5 | RIR: jamb & casing for interior door (closest) | 1.43 | Not a direct match. |
| 1016 | Main entry door full install | 8.0 / 10.0 / 13.0 | FC: exterior door components | threshold 0.518, weatherstrip (bronze) 1.53, sidelight 0.75 | Main door hang not captured. RIR exterior door surround 0.234 to 0.431/LF. |
| 1017 | Storm door full install | 5.0 / 7.0 / 9.0 | RIR: assemble & install storm door / R&R storm door | **1.21** (RIR) / **4.92** (R&R SV) | Same as 1008. |

### 2xxx: Plumbing

| Code | Dovetails item | Dovetails hrs | Craftsman (book: line) | Craftsman hrs | Notes / what's included |
|---|---|---|---|---|---|
| 2001 | Faucet replacement | 1.25 / 1.5 / 2.0 | RIR: faucet / kitchen sink faucet | **0.557 to 0.561** + remove 0.356 = **~0.92** swap | Includes feeder tubes. Material $233 economy to $1,370 deluxe. R&R SV says 3.56 h (plumber, full hookup), so the books disagree; RIR is the repair-work number. Shower faucet 0.576. |
| 2002 | Showerhead replacement | 0.5 / 0.75 / 1.0 | R&R: shower head with mixer valve, open wall | 2.67 SV | That is a valve job, not a head swap. No head-only line found. |
| 2003 | Toilet flapper/fill valve | 0.5 / 0.75 / 1.0 | none | none | No tank-parts line found. |
| 2004 | Toilet seat installation | 0.5 / 0.5 / 0.75 | RIR: toilet seat | **0.223** | Seat $60 round to $132 elongated. |
| 2005 | Toilet replacement | 2.0 / 2.5 / 3.0 | RIR: toilet + toilet finish plumbing | **1.33** + finish plumbing 0.345 = **1.68** | Includes toilet, wax ring, bolts with caps. Finish plumbing = cold supply, shut-off valve, wax ring, bolts ($183 chrome). Remove & reinstall same toilet 2.16 h. R&R SV: install 2.67 + demo 0.89. |
| 2006 | Sink drain/P-trap | 1.0 / 1.5 / 2.0 | RIR: sink finish plumbing | **0.475** | Water feeds, P-trap, escutcheons to wall ($276 chrome). R&R strainer/drain assembly 1.33 SV. |
| 2007 | Garbage disposal | 1.5 / 2.25 / 3.0 | RIR: garbage disposal | **1.51** + remove 0.628 = **2.14** swap | 1/3 hp $161 to 1 hp $473. Remove & reinstall 2.51. Matches our typical. |
| 2008 | Dishwasher hookup | 2.0 / 2.5 / 3.0 | RIR: dishwasher + dishwasher plumbing | **1.85** + remove 0.649 = **2.5** swap; plumbing 1.39 to 1.49 | Plumbing line = supply + drain rough. Matches ours. |
| 2009 | Washer/dryer hookup | 1.5 / 2.0 / 3.0 | RIR: washing machine, top loading | **1.49** | Appliance crew. |
| 2010 | Minor leak detection | 1.0 / 1.5 / 2.0 | RIR: repair pin-hole leak in cast-iron DWV with epoxy | 0.544 | Also: replace section of PVC / no-hub DWV (includes drywall cut-out, no wall repair). |
| 2011 | Bath remodel: floor & tile | 16 / 19 / 22 | RIR: tile floor | **0.180 /SF**, remove 0.080/SF, regrout 0.035/SF | 50 SF bath = 9 h install + 4 h tear-out. Min charge 3.0 h. Quarry tile 0.143/SF. Vinyl plank 0.053/SF. |
| 2012 | Bath remodel: vanity & plumbing | 4 / 6 / 8 | RIR: bathroom vanity cabinet + sink finish plumbing | **0.371 /LF** + 0.475 | 36" vanity = 1.1 h + 0.5 h plumbing. Laminate top 0.286/SF, cultured marble 0.314/SF. |
| 2013 | Bath remodel: carpentry & surfaces | 12 / 15 / 18 | R&R: tile tub wall (SV) | 0.381 /SF | Wainscot cap 0.222/LF SV. Tub/shower unit 3.23, shower stall 2.70 (RIR). |
| 2014 | Bath remodel: paint & finish | 11 / 13 / 15 | none specific | none | Use painting rates below. |

### 3xxx: Electrical

| Code | Dovetails item | Dovetails hrs | Craftsman (book: line) | Craftsman hrs | Notes / what's included |
|---|---|---|---|---|---|
| 3001 | Light fixture replacement | 0.75 / 1.0 / 1.5 | RIR: light fixture | **0.574** + remove 0.300 = **0.87** swap | Economy $43 to deluxe $358. Hanging fixture 0.305. Remove & reinstall 1.02. |
| 3002 | Ceiling fan | 1.0 / 1.5 / 2.0 | RIR: ceiling fan / fan with light | **2.45** fan only, **3.68** with light | Includes assembly. Light kit 0.525. Remove & reinstall 2.74. EL (new install): 1.25 to 1.80. RIR suggests our 1.5 is tight for a fan with light. |
| 3003 | Outlet/switch replacement | 0.5 / 0.75 / 1.0 | EL: switch / receptacle | 0.20 to 0.30 | New construction, box ready. |
| 3004 | GFCI outlet replacement | 0.75 / 1.0 / 1.25 | EL: GFCI receptacle / RIR: GFCI with wiring | **0.20** device only (EL) | RIR 0.977 includes new wiring run. Tamper-resistant: add 15% to material. |
| 3005 | Dimmer switch | 0.75 / 1.0 / 1.25 | EL: dimmer, 120 V, incl. wallplate | **0.25** (fluorescent 0.30) | 600 W slide $13, touch $18, 3-way $36. |
| 3006 | Smart doorbell | 1.0 / 1.5 / 2.0 | RIR: door bell or chime | **1.24** chime, button only 0.137, low-voltage wiring 0.563 per button | Remove chime 0.209. Smart doorbell is button + transformer check; 0.14 to 0.70 h by Craftsman logic. |
| 3007 | Smart thermostat swap | 1.0 / 1.5 / 2.0 | RIR: thermostat (HVAC) | heat only 1.53, heat & AC 2.38, **programmable 3.49** | Electric-heat line thermostat only 0.183 to 0.326. Wiring per thermostat 0.538. |
| 3008 | Smoke/CO detector | 0.75 / 1.0 / 1.5 | RIR: smoke / CO detector | battery **0.355**, hard-wired **0.398** + remove 0.200 | Smoke $100 to $129, CO $115 to $143. EL: battery 0.30, 120 V 0.50. |
| 3009 | Motion sensor light | 1.0 / 1.5 / 2.0 | RIR: install exterior flood light | **0.591** | Motion detector with 50 LF wiring 1.49. |
| 3010 | Under-cabinet lighting | 3.0 / 3.5 / 4.5 | none | none | Only an under-cabinet microwave (0.95) was found. |
| (extra) | Bath exhaust fan | none | RIR: bathroom exhaust fan, incl. 10 LF duct | **0.685** (with heat lamp 0.883) | Remove & reinstall 1.12. Candidate for a new code. |

### 4xxx: Carpentry, assembly, shelving

| Code | Dovetails item | Dovetails hrs | Craftsman (book: line) | Craftsman hrs | Notes / what's included |
|---|---|---|---|---|---|
| 4001 to 4003 | Furniture / bed / bookshelf assembly | 1.0 to 2.5 | none | none | Flat-pack assembly isn't in any book. Built-in bookcase 0.269/SF is a different job. |
| 4004 | Closet organizer | 2.0 / 2.5 / 3.0 | RIR: closet organizer system | **0.304 /SF** std, 0.414 /SF high | Shelf + bracket + rod: 0.332/LF ($43/LF). FC: pre-hung closet shelves 0.75 (<3') / 1.25 (>3'). |
| 4005 / 4012 | Floating / custom shelves | none | RIR: glass bath shelf / closet shelf & rod | 0.283 ea / 0.332 /LF | No floating-shelf line. |
| 4006 | Built-in cabinet repair | 2.0 / 2.5 / 3.0 | RIR: medicine cabinet (closest) | recessed 1.31, surface 1.51 | Cabinet repair lines not captured. |
| 4007 | Deck board replacement | 1.5 / 2.25 / 3.0 | RIR: treated exterior decking | **0.037 to 0.040 /SF** + remove 0.026/SF | 2x6 treated $13.80/SF installed material. 40 SF repair = 2.5 h. Deck railing 0.275/LF. Deck stairs 0.540 per step. |
| 4008 | Fence panel replacement | 1.5 / 2.25 / 3.0 | RIR: board / picket fence | board 6' **0.286 /LF**, picket 3' 0.222/LF | Min charge 1.75 h. Remove 3' wood fence 0.161/LF. Gate 2.0 to 3.0 ea; gate hardware 0.754. One 8' panel = 2.3 h. |
| 4009 | Stair/step repair | 1.5 / 2.0 / 2.5 | RIR: straight stairs, per step | **0.474 to 0.517** per step | Includes treads and risers. Remove 0.122 per step. |
| 4010 | Handrail installation | 1.5 / 2.25 / 3.0 | RIR: pine stair balustrade | 1.32 /LF (full balustrade with newel) | No wall-mounted handrail line captured. Deck railing 0.275/LF. |
| 4011 | Baseboard install per LF | none | RIR: clamshell base | **0.038 /LF** | Fill our empty hours with this. |
| 4013 | Garage divider wall framing | none | RIR: 2x4 interior partition wall, 8', 16" OC | **0.241 /LF** (24" OC 0.205) | Assumes 4 openings and 5 corners per 56 LF. 2x6 wall 0.244/LF. Remove 0.045/LF. |

### 5xxx: Painting

Two sources: RIR per-item lines (repair-style, burdened labor) and PA production rates (Medium crew).

| Code | Dovetails item | Dovetails hrs | Craftsman (book: line) | Craftsman hrs | Notes |
|---|---|---|---|---|---|
| all | Painting minimum | none | RIR: painting min charge | **3.00** | |
| 5001 / 5020 / 5012 | Walls | 2.0 / 2.25 / 3.0 (accent); 7 / 9 / 11 (room) | PA: walls, drywall, orange peel, roll, flat latex | **538 SF/hr**, 275 SF/gal per coat | 12x12 room, 8' walls (~384 SF), 2 coats = ~1.4 h roll time. The rest of our 9 h is prep, cut-in, masking, moving furniture, cleanup. |
| 5021 | Ceiling add-on | 2.0 / 2.5 / 3.0 | PA: ceilings, textured, roll | 350 SF/hr 1st coat, 375 2nd; primer 375 SF/hr | |
| 5002 | Door painting | none | RIR: paint interior door | prime 0.340, **2 coats 0.538**; stain & varnish 2 coats 0.822 | Jamb & casing 0.017/LF for 2 coats. PA: frames and trim per opening 0.063. |
| 5003 | Trim/baseboard painting | 1.0 / 1.5 / 2.0 | PA: trim per 100 LF / RIR: jamb & casing | **270 LF/hr** (0.37 h per 100 LF) | Cutting-in by hand at baseboards 270 LF/hr. |
| 5004 | Fence painting/staining | 3.0 / 4.0 / 5.0 | PA: picket fence stain, brush | 113 SF/hr 1st, 145 SF/hr 2nd | Picket: measure one side, x4 for both sides. Solid plank: x2. |
| 5005 | Deck staining/sealing | 4.0 / 5.0 / 6.0 | PA: deck surfaces, steps, treads, porches | 175 SF/hr per coat | |
| 5006 | Cabinet painting | 2.5 / 3.5 / 4.5 | PA: cabinets, paint grade, roll & brush | undercoat 93 SF/hr, finish coats 113 SF/hr | Measured on overall face dimensions. |
| 5007 | Shed painting | 2.0 / 2.5 / 3.0 | PA: siding rates | follow up | |
| 5008 / 5009 | Touch-up | 0.5 to 2.5 | PA: wash & touch-up | 160 SF/hr | Wash only 200 SF/hr. |
| 5010 | Garage floor epoxy | 6.0 / 7.0 / 9.0 | PA: epoxy coating | 150 SF/hr 1st, 200 SF/hr 2nd; 325 to 350 SF/gal | 250 SF garage = 1.7 + 1.25 h coating time, plus prep/etch. Concrete paint 145 to 225 SF/hr. |
| 5011 | Caulking & sealing | 0.75 / 1.0 / 1.5 | not captured | none | |
| 5027 | Stairwell painting | 7 / 9 / 11 | RIR: paint stair tread / riser / balustrade | tread 0.192, riser 0.177 (2 coats); balustrade 0.300/LF | 13-step stair, treads + risers 2 coats = 4.8 h. |
| (extra) | Windows | none | RIR: paint window, per side | small 0.467, avg **0.666**, large 0.845 (2 coats) | |

### 6xxx to 9xxx: Exterior, mounting, maintenance, flooring

| Code | Dovetails item | Dovetails hrs | Craftsman (book: line) | Craftsman hrs | Notes |
|---|---|---|---|---|---|
| 6001 | Gutter cleaning | 1.75 / 2.25 / 3.0 | none for cleaning | none | Install rain gutter 0.041/LF; paint gutter 2 coats 0.029/LF. |
| 6003 | Pressure washing | 2.5 / 3.5 / 4.5 | PA: wash surfaces | 200 SF/hr wash; 1,000 SF/hr light rinse | |
| 6005 | Shed assembly | 5.0 / 6.0 / 8.0 | none | none | |
| 6009 | Storm window install | 1.5 / 2.0 / 2.5 | RIR: aluminum storm window | **1.00** ea (60" tall 1.08) | $155 to $399 by size. |
| 6010 | Screen porch repair | 2.5 / 3.5 / 5.0 | RIR: window screen / pool enclosure screen | 0.125 ea / 0.018 /SF | Sliding patio screen door 0.125. |
| 6002, 6004, 6006, 6007, 6008 | Gutter guard, patio furniture, mailbox, house numbers, ext. caulk | various | none | none | |
| 7001 | TV mounting | 1.5 / 2.25 / 3.0 | none | none | |
| 7002 | Curtain rod | 0.75 / 1.0 / 1.5 | RIR: shower curtain rod | 0.113 | Closest only. R&R SV 0.333. |
| 7003 | Blind/shade | 0.5 / 0.75 / 1.0 | RIR: motorized roller shade add | 2.0 | Manual blind line not captured. |
| 7004 | Mirror mounting | 0.75 / 1.0 / 1.5 | RIR: bathroom mirror | **0.106 /SF** | 24x36 mirror = 0.64 h. Remove glued mirror 0.041. |
| 7008 | Grab bar | 1.0 / 1.5 / 2.0 | R&R: grab bar, concealed mount, stainless | **0.533** SV | $38 to $43. |
| 7009 | Towel bar / TP holder | 0.5 / 0.75 / 1.0 | RIR: towel bar / TP dispenser / robe hook | **0.393** / 0.188 | Full bath set (towel bar, cloth bar, robe hook, TP, cup holder) 4.02; half-bath set 2.17. |
| 7010 | Closet rod | 0.75 / 1.0 / 1.25 | RIR: closet shelf brackets, shelving & rod | 0.332 /LF | |
| 7005 to 7007 | Pictures, whiteboard, baby gate | various | none | none | |
| 8003 | Weatherstripping | 1.0 / 1.5 / 2.0 | RIR: door weatherstripping | **0.417** per door (replace), install-only line 2.30 | Remove 0.195. FC bronze weatherstrip 1.53. |
| 8004 | Door sweep | 0.75 / 1.0 / 1.25 | RIR: door sweep / threshold | **0.431** / 0.477 | Sweep $56, threshold $31 to $58. Remove 0.24 to 0.26. |
| 8007 | Minor siding repairs | 1.5 / 2.25 / 3.0 | RIR: siding min charge | **3.00** min | Single shingle 0.477; fiber-cement / shingle 0.045/SF. |
| 8008 | Shutters | 1.25 / 1.75 / 2.25 | RIR: shutters (mobile-home style) | 0.205 per pair | Paint shutter per side line exists. |
| 8010 | Attic hatch / insulation | 1.5 / 2.25 / 3.0 | RIR: disappearing attic stairs | 2.39 | Hatch-only line not captured. |
| 8001, 8002, 8005, 8006, 8009 | Dryer vent, filters, closer, garage hooks, foundation caulk | various | none | none | RIR door closer exists, not captured in detail. |
| 9010 | LVP flooring | none | RIR: vinyl plank flooring | **0.053 /SF** | Standard $3.62/SF, high $4.64, deluxe $6.49 (all widths). Fill our empty hours with this. |
| 9011 | Subfloor prep | none | RIR: floor underlayment | 0.167 to 0.169 /SY | |
| 9013 | Flooring removal | none | RIR: remove vinyl / tile / carpet | vinyl 0.175/SY, tile 0.080/SF, carpet 0.062/SY | Sheet vinyl install 0.183/SY; carpet 0.138/SY. |

## What this tells us

1. **Fill the empty codes first.** 4011 baseboard (0.038/LF), 4013 framing (0.241/LF), 5002 doors
   (0.538 per door, 2 coats), 9010 LVP (0.053/SF), 9011 underlayment and 9013 removal all have
   solid Craftsman rates. Today they have no hours at all.
2. **Many of our jobs should be per-unit, not flat.** Trim, crown, chair rail, deck boards, fence,
   stairs, LVP and painting all have clean per-LF, per-SF or per-step rates. Add a trip/minimum on top.
3. **Craftsman's repair book is faster than our numbers on fixture swaps** (faucet ~0.9 h vs our 1.5;
   toilet 1.7 h vs 2.5; light fixture 0.9 vs 1.0). That is pure wrench time. Our numbers carry
   setup, trips and old-house surprises. Craftsman's per-trade minimums (3 h painting, 6.5 h drywall)
   back up a firm minimum on every visit.
4. **Craftsman is slower than us on ceiling fans** (2.45 h fan only, 3.68 h with light, vs our 1.5).
   Worth checking our actuals.
5. **Books disagree** (faucet: RIR 0.56 vs R&R 3.56; storm door: RIR 1.21 vs R&R 4.92). Treat
   Craftsman as a range, and let our own job actuals (TASK-188/189 hourly baseline) settle each code.
6. **Parts lists:** each RIR line names what it includes (toilet: wax ring, bolts with caps; finish
   plumbing: supply, shut-off, wax ring; drywall: board, mud, screws, tape, bead; exhaust fan: 10 LF duct
   and wall outlet). These are ready seeds for `service_materials`.

## Gaps (no usable Craftsman line)

- **Codes:** 1006, 1009, 1014 (window chapter not reached), 2002, 2003, 3010, 4001 to 4003, 4005,
  6001 (cleaning), 6002, 6004 to 6008, 7001, 7003, 7005 to 7007, 8001, 8002, 8005, 8006, 8009.
- **What fills the gap:** for these, our own hours and real job actuals stay the only source.

## Next step (owner decision)

- If any of these numbers go into the app, add a backlog task first (backlog gating rule), citing the
  ROADMAP phase. Suggested shape: store Craftsman hours and included parts as **cited reference values**
  (book, edition, line, date) next to Dovetails hours, never overwriting them. That fits the
  evidence-ledger design in estimating-assistant Phase 3.
- Possible follow-ups: window chapter (1014), interior painting walls table in PA, door closer.
