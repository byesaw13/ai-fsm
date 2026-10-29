# Price book refresh: review sheet

Status: **draft for owner review** (2026-10-29). Nothing in the app or database has changed.
Task: TASK-220. Related: TASK-218 (Craftsman reference hours), TASK-219 (production rates),
TASK-221 (materials checklists), `docs/working/craftsman-reference-pricebook.md`.

## What the job history says

Source: production database, read 2026-10-29. 71 jobs, 41 estimates (84 lines), 60 invoices (208 lines).
Test and non-work records left out. Counts are jobs whose title, description or line items mention the
work. A large job counts once in each kind of work it includes. Customer names are not reproduced here.

| Kind of work | Jobs | Price book today |
|---|---|---|
| Interior painting (rooms, whole house, stairwells) | ~20 | 5020 to 5027, 5012 (5012 has no hours) |
| Drywall and ceiling repair (patches, water stains, cracks, tape joints, skim coat) | ~12 | 1001 to 1004, 5026, 9002 |
| Exterior wood repair (rot, fascia, sills, window and door casing, siding patches) | ~10 | 8007, 9005 (no hours, no price) |
| Pre-sale, inspection and punch-list packages | ~8 | 5024, 5025 only |
| Light fixtures, ceiling fans, small electrical | ~8 | 3001 to 3010 |
| Custom builds (loft, coop, bin, bedside tables, partition walls) | ~7 | 9004, 4013 (no hours, no price) |
| Doors (slab, prehung, frame rebuild, glass, closet doors) | ~6 | 1005, 1016 (entry only) |
| Plumbing (faucets, shut-off valves, disposal, vanity) | ~6 | 2001 to 2014 |
| Furniture assembly | ~5 | 4001 to 4003 |
| Decks, porches, stairs, screens | ~5 | 4007, 4009, 6010 |
| Baseboard and trim install | ~4 | 1011, 4011 (4011 has no hours) |
| Shelving and closets | ~3 | 4004, 4005, 4012 (4005, 4012 no hours) |
| Windows (replacement, sills) | ~3 | 1014 |
| Flooring (LVP, peel-and-stick, tile removal) | ~3 | 9010 to 9013 (no hours, no price) |
| Small roofing (shed, gazebo, coop, roll roofing) | ~3 | **none** |
| Hanging and mounting (mirrors, art, curtain rods) | ~3 | 7002, 7004, 7005 |
| Cleanout and haul-away | ~3 | **none** |
| Garage door panels | 2 | **none** |
| Landscaping (mulch beds, stumps) | 2 to 3 | **none** (owner decision: in scope?) |

Three things stand out:

1. **The price book was never linked to the work.** 0 of 84 estimate lines carry a price book code.
   Most big jobs were priced as hours or T&M lines.
2. **The work you do most has the thinnest codes.** Painting, drywall, exterior wood repair and custom
   builds are about two thirds of the jobs. Their codes are either missing hours or are placeholders
   (9001 to 9006).
3. **Many codes are for work that never came in:** baby gate, whiteboard, house numbers, mailbox,
   patio furniture, gutter guards, smart doorbell, under-cabinet lighting. They are harmless, but
   they are not where the book needs effort.

## How prices are built today

Most prices are already close to **typical hours × $85** (the Settings rate). 78 of the 99 codes that
have both hours and a price are within 15% of it. So the rate math is not the problem. The prices
feel wrong because:

- **The hours are guesses.** None are confirmed by actuals. TASK-219 corrected 8 production rates
  against Craftsman; the flat hours on the price book have not been reviewed.
- **Flat prices don't scale.** Trim, deck boards, fence, flooring, drywall over 12" and painting are
  one flat price whatever the size.
- **Small jobs are bumped up by hand instead of by a rule.** 21 codes sit 15% to 76% above
  hours × $85, all small jobs (toilet seat +52%, smoke detector +76%, window latch +33%). That is a
  minimum charge in disguise. A trip or minimum rule (Craftsman uses per-trade minimums) would say it
  once.
- **Materials are inside some prices and outside others,** with no marker saying which.
- **16 codes have no hours and 11 have no price.**

## Proposal (owner decides each part)

### A. Prices come from hours

Price = typical hours × the Settings rate, plus a separate minimum or trip rule, plus materials. When
the rate changes, every price follows. This is the hourly baseline formula already approved for
estimates (TASK-189, `docs/working/hourly-baseline.md`), applied to the price book itself.

Owner decisions:
- **A1.** Which rate: Settings $85, or a separate price book rate? (History also shows $115/h T&M.)
- **A2.** Minimum: one minimum per visit, or per trade like Craftsman (3 h painting, 6.5 h drywall)?
- **A3.** Keep the hand bumps on the 21 small-job codes as a per-code override, or let the minimum
  rule replace them?

### B. Measurable work is priced per unit

Each becomes hours per unit × rate, using the production rates (TASK-219) or the Craftsman reference:

| Code | Today | Per-unit basis proposed | Craftsman reference |
|---|---|---|---|
| 1011 Baseboard & trim replacement | flat 2 h | per LF | 0.038 h/LF install |
| 1012 Crown molding | flat 4 h | per LF | 0.046 h/LF (0.098 complex) |
| 1013 Chair rail | flat 2.25 h | per LF | 0.038 h/LF |
| 1003 Drywall patch >12" | flat 3.5 h | per SF over 12" | 0.028 to 0.041 h/SF |
| 4007 Deck board replacement | flat 2.25 h | per SF | 0.037 h/SF + remove 0.026 |
| 4008 Fence panel replacement | flat 2.25 h | per LF | 0.286 h/LF (6 ft board) |
| 4011 Baseboard install | $7/LF, no hours | per LF with hours | 0.038 h/LF |
| 4012 Custom shelf | $45/LF, no hours | per LF with hours | 0.332 h/LF (shelf, bracket, rod) |
| 5002 Door painting | $75, no hours | per door | 0.538 h, 2 coats (TASK-219 rate: 9 a day) |
| 5012 Interior room painting | $3, no hours | per SF of wall | production rate 5012 |
| 9010 LVP flooring | nothing | per SF | 0.053 h/SF |
| 9011 Subfloor prep / skim coat | nothing | per SF | underlayment 0.167 h/SY |
| 9013 Flooring removal | nothing | per SF | TASK-219 rate: 410 SF a day |

### C. New codes for the work you actually do

Proposed from the history above. Craftsman hours are shown where the captured data has a clear line;
"capture" means a targeted Craftsman search is needed (one owner-approved session).

| Proposed code | From history | Unit | Craftsman reference |
|---|---|---|---|
| Exterior trim / fascia rot repair | ~10 jobs | LF | wood fascia 0.037 h/LF |
| Window sill replacement (exterior) | 2 to 3 jobs | each | capture |
| Window or door casing replacement | ~4 jobs | LF | casing remove & reinstall 0.083 h/LF |
| Ceiling water-damage repair (cut out, patch, paint) | ~4 jobs | each | drywall patch 1.42 h + min 6.5 h |
| Drywall crack / tape-joint repair | ~3 jobs | LF | tape and bed 0.023 h/SF |
| Skim coat walls | 2 jobs | SF | capture |
| Interior prehung door replacement | ~3 jobs | each | capture (exterior door, jamb & casing 2.20 h for comparison) |
| Door frame / jamb repair | 2 jobs | each | capture |
| Garage door panel replacement | 2 jobs | panel | capture (spring 2.00 h, hardware 0.762 h) |
| Shut-off valve replacement | 2 jobs | each | capture |
| Vanity install (cabinet, top, faucet, hookup) | 2 jobs | each | vanity 0.371 h/LF + sink finish plumbing 0.475 h |
| Bathroom exhaust fan replacement | 1 job | each | 0.685 h (with heater 0.952), includes 10 LF duct |
| Small roof repair (roll roofing, shingle patch on shed or gazebo) | ~3 jobs | SF or square | capture (roofing chapter) |
| Cleanout and haul-away | ~3 jobs | load | none (our own rate) |
| Access panel install | 1 job | each | access door 0.664 h |
| Door threshold replacement | Craftsman only | each | 0.262 h remove, 0.518 h set |
| Door closer (interior/exterior, not screen) | Craftsman only | each | 0.291 h |
| Tile regrout | Craftsman only | SF | 0.035 h/SF |
| Window painting (per side) | Craftsman only | each | 0.666 h, 2 coats |

Rules for adding a code:
- Only work you have done or would sell. Each code needs hours, a parts list, and later a checklist
  (TASK-221), so every code is upkeep.
- Codes are written by us. Craftsman supplies reference hours beside them (TASK-218), never the code
  list itself. ROADMAP excludes a licensed Craftsman catalog import.

### D. Codes to retire or hide

Owner picks which to hide from the picker (hidden, not deleted; old estimates keep them):
4001 to 4003 are kept (assembly is real work). Candidates to hide: 3006 smart doorbell, 3010
under-cabinet lighting, 6002 gutter guards, 6004 patio furniture, 6006 mailbox, 6007 house numbers,
7006 whiteboard, 7007 baby gate, 8002 filter changes.

### E. Placeholders become real or go away

9001 Specialty project, 9003 Large-scale painting, 9004 Custom carpentry, 9005 Exterior structural,
9006 Advanced seasonal and 9099 Custom have no hours and no price. They act as "hourly" buckets.
Proposal: keep 9004 and 9099 as explicitly hourly codes (price = hours entered × rate), and fold the
others into the new codes in part C.

## Price check, every code

Hours × $85 against today's price. "—" means missing data.

| Code | Name | Typical h | Price | h × $85 | Difference |
|---|---|---|---|---|---|
| 1001 | Drywall patch <=6" | 1.00 | $95 | $85 | +11% |
| 1002 | Drywall patch 6-12" | 2.00 | $175 | $170 | +2% |
| 1003 | Drywall patch >12" | 3.50 | $295 | $297 | +0% |
| 1004 | Drywall patch with texture match | 4.50 | $375 | $382 | -1% |
| 1005 | Door slab replacement | 2.50 | $225 | $212 | +5% |
| 1006 | Door adjustment (sticking/rubbing) | 1.00 | $95 | $85 | +11% |
| 1007 | Door hardware replacement | 1.00 | $95 | $85 | +11% |
| 1008 | Storm/screen door installation | 5.00 | $425 | $425 | +0% |
| 1009 | Window lock/latch repair | 0.75 | $85 | $63 | +33% |
| 1010 | Window screen replacement/repair | 0.75 | $85 | $63 | +33% |
| 1011 | Baseboard & trim replacement | 2.00 | $195 | $170 | +14% |
| 1012 | Crown molding install/repair | 4.00 | $395 | $340 | +16% |
| 1013 | Chair rail installation | 2.25 | $195 | $191 | +1% |
| 1014 | Full-frame window replacement (no interior finish) | 4.50 | $425 | $382 | +11% |
| 1015 | Window rough-opening build-out adder | 1.00 | $125 | $85 | +47% |
| 1016 | Main entry door – full installation | 10.00 | $1100 | $850 | +29% |
| 1017 | Storm door – full installation | 7.00 | $750 | $595 | +26% |
| 2001 | Faucet replacement | 1.50 | $145 | $127 | +13% |
| 2002 | Showerhead replacement | 0.75 | $85 | $63 | +33% |
| 2003 | Toilet flapper/fill valve replacement | 0.75 | $75 | $63 | +17% |
| 2004 | Toilet seat installation | 0.50 | $65 | $42 | +52% |
| 2005 | Toilet replacement (standard swap) | 2.50 | $225 | $212 | +5% |
| 2006 | Sink drain/P-trap replacement | 1.50 | $125 | $127 | -1% |
| 2007 | Garbage disposal installation/replacement | 2.25 | $195 | $191 | +1% |
| 2008 | Dishwasher hookup | 2.50 | $225 | $212 | +5% |
| 2009 | Washer/dryer hookup | 2.00 | $195 | $170 | +14% |
| 2010 | Minor leak detection (non-invasive) | 1.50 | $145 | $127 | +13% |
| 2011 | Bathroom remodel – floor & tile (labor only) | 19.00 | $1600 | $1615 | +0% |
| 2012 | Bathroom remodel – vanity & plumbing (labor only) | 6.00 | $500 | $510 | -1% |
| 2013 | Bathroom remodel – carpentry & surfaces (labor only) | 15.00 | $1200 | $1275 | -5% |
| 2014 | Bathroom remodel – paint & finish (labor only) | 13.00 | $1100 | $1105 | +0% |
| 3001 | Light fixture replacement | 1.00 | $95 | $85 | +11% |
| 3002 | Ceiling fan installation/replacement | 1.50 | $150 | $127 | +17% |
| 3003 | Outlet/switch replacement | 0.75 | $75 | $63 | +17% |
| 3004 | GFCI outlet replacement | 1.00 | $95 | $85 | +11% |
| 3005 | Dimmer switch installation | 1.00 | $95 | $85 | +11% |
| 3006 | Smart doorbell installation | 1.50 | $150 | $127 | +17% |
| 3007 | Smart thermostat swap | 1.50 | $125 | $127 | -1% |
| 3008 | Smoke/CO detector installation | 1.00 | $150 | $85 | +76% |
| 3009 | Motion sensor light installation | 1.50 | $125 | $127 | -1% |
| 3010 | Under-cabinet lighting installation | 3.50 | $325 | $297 | +9% |
| 4001 | Furniture assembly (flat-pack/IKEA) | 1.50 | $125 | $127 | -1% |
| 4002 | Bed frame assembly | 1.50 | $125 | $127 | -1% |
| 4003 | Bookshelf/entertainment center assembly | 2.00 | $165 | $170 | -2% |
| 4004 | Closet organizer installation | 2.50 | $225 | $212 | +5% |
| 4005 | Floating shelves installation | — | $45 | — | — |
| 4006 | Built-in cabinet repair | 2.50 | $225 | $212 | +5% |
| 4007 | Deck board replacement | 2.25 | $195 | $191 | +1% |
| 4008 | Fence panel replacement | 2.25 | $195 | $191 | +1% |
| 4009 | Stair/step repair | 2.00 | $165 | $170 | -2% |
| 4010 | Handrail installation | 2.25 | $195 | $191 | +1% |
| 4011 | Baseboard installation (per LF, labor only) | — | $7 | — | — |
| 4012 | Shelf installation – custom (per LF, labor only) | — | $45 | — | — |
| 4013 | Garage divider wall or partition framing | — | — | — | — |
| 5001 | Accent wall painting | 2.25 | $195 | $191 | +1% |
| 5002 | Door painting | — | $75 | — | — |
| 5003 | Trim/baseboard painting | 1.50 | $150 | $127 | +17% |
| 5004 | Fence painting/staining | 4.00 | $345 | $340 | +1% |
| 5005 | Deck staining/sealing | 5.00 | $425 | $425 | +0% |
| 5006 | Cabinet painting (small scale) | 3.50 | $295 | $297 | +0% |
| 5007 | Shed painting | 2.50 | $225 | $212 | +5% |
| 5008 | Touch-up painting (patches <=6") | 0.75 | $75 | $63 | +17% |
| 5009 | Touch-up painting (patches >6") | 2.00 | $165 | $170 | -2% |
| 5010 | Garage floor epoxy (small spaces) | 7.00 | $595 | $595 | +0% |
| 5011 | Caulking & sealing | 1.00 | $95 | $85 | +11% |
| 5012 | Interior room painting | — | $3 | — | — |
| 5020 | Room painting – walls only (standard bedroom/office) | 9.00 | $820 | $765 | +7% |
| 5021 | Room painting – ceiling add-on | 2.50 | $225 | $212 | +5% |
| 5022 | Room painting – walls + ceiling + trim | 12.00 | $1150 | $1020 | +12% |
| 5023 | Half bath / small room – walls only | 2.50 | $265 | $212 | +24% |
| 5024 | Pre-sale room refresh – repairs + paint | 3.50 | $300 | $297 | +0% |
| 5025 | Kitchen pre-sale refresh | 5.50 | $500 | $467 | +6% |
| 5026 | Ceiling stain repair – feathered blend | 1.50 | $150 | $127 | +17% |
| 5027 | Stairwell / open staircase painting | 9.00 | $795 | $765 | +3% |
| 6001 | Gutter cleaning (1-story, <=150 ft) | 2.25 | $195 | $191 | +1% |
| 6002 | Gutter guard installation | 3.50 | $325 | $297 | +9% |
| 6003 | Pressure washing (deck/siding) | 3.50 | $295 | $297 | +0% |
| 6004 | Patio furniture assembly | 1.50 | $125 | $127 | -1% |
| 6005 | Shed assembly | 6.00 | $495 | $510 | -2% |
| 6006 | Mailbox install/repair | 1.00 | $85 | $85 | +0% |
| 6007 | House number installation | 0.75 | $65 | $63 | +1% |
| 6008 | Exterior caulking/weatherproofing | 1.75 | $145 | $148 | -2% |
| 6009 | Storm window installation | 2.00 | $165 | $170 | -2% |
| 6010 | Screen porch repair | 3.50 | $295 | $297 | +0% |
| 7001 | TV mounting (<=65") | 2.25 | $195 | $191 | +1% |
| 7002 | Curtain rod installation | 1.00 | $95 | $85 | +11% |
| 7003 | Blind/shade installation | 0.75 | $75 | $63 | +17% |
| 7004 | Mirror mounting | 1.00 | $95 | $85 | +11% |
| 7005 | Picture/gallery wall hanging | 1.50 | $125 | $127 | -1% |
| 7006 | Whiteboard/bulletin board installation | 1.00 | $85 | $85 | +0% |
| 7007 | Baby gate installation | 1.00 | $85 | $85 | +0% |
| 7008 | Grab bar installation (bathroom safety) | 1.50 | $125 | $127 | -1% |
| 7009 | Towel bar/toilet paper holder installation | 0.75 | $75 | $63 | +17% |
| 7010 | Closet rod installation | 1.00 | $85 | $85 | +0% |
| 8001 | Dryer vent cleaning | 1.50 | $125 | $127 | -1% |
| 8002 | Filter changes (furnace, AC, fridge) | 0.75 | $65 | $63 | +1% |
| 8003 | Weatherstripping replacement | 1.50 | $150 | $127 | +17% |
| 8004 | Door sweep installation | 1.00 | $95 | $85 | +11% |
| 8005 | Screen door closer replacement | 0.75 | $85 | $63 | +33% |
| 8006 | Garage organization (hooks, racks) | 1.75 | $145 | $148 | -2% |
| 8007 | Minor siding repairs | 2.25 | $195 | $191 | +1% |
| 8008 | Shutter install/repair | 1.75 | $145 | $148 | -2% |
| 8009 | Foundation/seam caulking | 1.75 | $145 | $148 | -2% |
| 8010 | Attic hatch/outlet insulation | 2.25 | $195 | $191 | +1% |
| 9001 | Specialty project | — | — | — | — |
| 9002 | Advanced drywall/texture work | 6.00 | $495 | $510 | -2% |
| 9003 | Large-scale painting projects | — | — | — | — |
| 9004 | Custom carpentry/fabrication | — | — | — | — |
| 9005 | Exterior structural repairs | — | — | — | — |
| 9006 | Advanced seasonal jobs | — | — | — | — |
| 9010 | LVP flooring installation | — | — | — | — |
| 9011 | Concrete subfloor prep / skim coat | — | — | — | — |
| 9012 | Self-leveling compound application | — | — | — | — |
| 9013 | Existing flooring removal | — | — | — | — |
| 9099 | Custom / uncatalogued service | — | — | — | — |

## Next step

The owner marks each decision (A1 to A3, B rows, C rows, D, E). The changes then ship as guarded data
migrations, as TASK-219 did: no new tables, each change only applies while the row still holds
today's value, with a reversal comment.
