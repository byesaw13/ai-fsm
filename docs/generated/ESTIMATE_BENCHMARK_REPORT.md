# Dovetails AI-FSM: Estimate vs Actual Benchmark Report

**Generated:** 2026-08-08T18:30:16.296Z  

---

## Executive Summary

- **Total Jobs Evaluated:** 53
- **Completed & Invoiced Jobs:** 32
- **Median Labor Ratio ($Actual / Estimated$):** 0.05x
- **Median Material Ratio ($Actual / Estimated$):** 1.00x
- **Mean Absolute Percentage Error (MAPE):** 0.9%
- **Signed Bias:** -0.9%

---

## Rate Calibration Recommendations

Using Bayesian shrinkage weighting ($	ext{PriorWeight} = 5$):

| Dimension | Observed Median | Clean Samples | Suggested Multiplier | Recommended Policy Action |
|---|---|---|---|---|
| **Labor Production Rate** | 0.05x | 1 | **0.842x** | Reduce estimated hours per unit |
| **Material Cost Allowance** | 1.00x | 0 | **1.000x** | Maintain current 15% material handling |

---

## Job Benchmark Detail Table

| Job # | Title | Status | Est Total ($) | Inv Total ($) | Est Hrs | Act Hrs | Labor Ratio | Variance ($) |
|---|---|---|---|---|---|---|---|---|
| J-2026-0041 | Approved work for Norman Boyd | completed | $190.37 | $0.00 | 1.2 | 0 | N/A | $-190.37 |
| J-2026-0040 | 16 E Chamberlain | invoiced | $195.98 | $195.98 | 0 | 0 | N/A | $0.00 |
| J-2026-0039 | Finish porches, siding backside of shed | invoiced | $914.58 | $914.58 | 0 | 0 | N/A | $0.00 |
| J-2026-0037 | General Repairs - Brian Floss | invoiced | $1829.00 | $1971.14 | 12.9 | 0 | N/A | $142.14 |
| J-2026-0036 | General Repairs - Rebbecca Edwards | scheduled | $0.00 | $0.00 | 0 | 0 | N/A | $0.00 |
| J-2026-0031 | Assembly Desk and hutch | completed | $160.00 | $160.00 | 1.9 | 0 | N/A | $0.00 |
| J-2026-0030 | Specialty Expansion - Joseph Legerstee | completed | $13850.00 | $17387.10 | 162.9 | 7.6 | 0.05x | $3537.10 |
| J-2026-0029 | General Repairs - Peter | in_progress | $13535.00 | $13535.00 | 159.2 | 0 | N/A | $0.00 |
| J-2026-0028 | Gazebo roof repair | invoiced | $150.14 | $150.14 | 1.8 | 0 | N/A | $0.00 |
| J-2026-0012 | Hallway, stairwell, ceiling, wallpaper paint | quoted | $3395.00 | $0.00 | 39.9 | 0 | N/A | $-3395.00 |
| J-2026-0011 | Home inspection repairs — bulkhead, faucet, window, electrical | invoiced | $500.00 | $500.00 | 0 | 0 | N/A | $0.00 |
| J-2026-0013 | Living room repaint (3 walls, color change) | quoted | $995.00 | $0.00 | 11.7 | 0 | N/A | $-995.00 |
| J-2026-0010 | Basement LVP flooring + skim coat (465 sf) | quoted | $6995.00 | $0.00 | 82.3 | 0 | N/A | $-6995.00 |
| J-2026-0020 | Punch List for home inspection | invoiced | $500.00 | $500.00 | 2.2 | 0 | N/A | $0.00 |
| J-2026-0009 | Interior/exterior repairs, fixtures, faucets | quoted | $5400.00 | $0.00 | 63.5 | 0 | N/A | $-5400.00 |
| J-2026-0008 | Woodpecker repair, door frame, tile, sheetrock, deck (24 hrs) | invoiced | $2385.55 | $2385.55 | 0 | 0 | N/A | $0.00 |
| J-2026-0007 | 2 ceiling fans + paint + door glass panel | invoiced | $1200.00 | $1200.00 | 0 | 0 | N/A | $0.00 |
| J-2026-0006 | Custom loft + slat wall + carpentry (60 hrs) | invoiced | $6759.68 | $6759.68 | 0 | 0 | N/A | $0.00 |
| J-2026-0005 | Sunroom ceiling repair | invoiced | $1150.00 | $1150.00 | 0 | 0 | N/A | $0.00 |
| J-2026-0004 | Interior restoration + painting + 2 baths | invoiced | $5500.00 | $5500.00 | 0 | 0 | N/A | $0.00 |
| J-2026-0003 | Interior painting — Phase 2 (staircase, office, master) | invoiced | $3633.13 | $3633.13 | 0 | 0 | N/A | $0.00 |
| J-2026-0002 | Pre-sale readiness — 8 rooms | invoiced | $2745.00 | $2745.00 | 0 | 0 | N/A | $0.00 |
| J-2026-0001 | Mirror/art hang, attic cleanout, ceiling patch (3 visits) | invoiced | $495.00 | $495.00 | 0 | 0 | N/A | $0.00 |
| J-2025-0012 | Pre-sale bathroom refinish (labor only) | quoted | $4400.00 | $0.00 | 51.8 | 0 | N/A | $-4400.00 |
| J-2025-0011 | 3 basement window replacements | quoted | $1275.00 | $0.00 | 15 | 0 | N/A | $-1275.00 |
| J-2025-0010 | Door replacement — 4 doors, full frame rebuild | invoiced | $3020.00 | $3020.00 | 0 | 0 | N/A | $0.00 |
| J-2025-0009 | Interior painting | quoted | $0.00 | $0.00 | 0 | 0 | N/A | $0.00 |
| J-2025-0008 | Interior painting | quoted | $0.00 | $0.00 | 0 | 0 | N/A | $0.00 |
| J-2025-0007 | Whole-house interior paint — 11 rooms (walls only) | quoted | $8757.00 | $0.00 | 103 | 0 | N/A | $-8757.00 |
| J-2025-0006 | Interior painting — Phase 1 (6 rooms) | quoted | $6439.00 | $0.00 | 75.8 | 0 | N/A | $-6439.00 |
| J-2025-0005 | Whole-house interior + exterior (9 rooms) | quoted | $16370.00 | $0.00 | 192.6 | 0 | N/A | $-16370.00 |
| J-2025-0004 | Window casings, sills, wall + seam repair | invoiced | $866.80 | $866.80 | 0 | 0 | N/A | $0.00 |
| J-2025-0015 | Fence panel installation + side-of-house repair | quoted | $561.65 | $0.00 | 3 | 0 | N/A | $-561.65 |
| J-2025-0014 | Garage divider wall installation | quoted | $1447.09 | $0.00 | 8 | 0 | N/A | $-1447.09 |
| J-2025-0003 | Interior paint + fixtures + exterior repairs (10 sections) | invoiced | $5754.35 | $5754.35 | 0 | 0 | N/A | $0.00 |
| J-2025-0002 | Painting & repair — living room, bath, master, kitchen entry | invoiced | $1305.00 | $1305.00 | 15.4 | 0 | N/A | $0.00 |
| J-2025-0001 | Shelving + baseboard installation | invoiced | $2536.09 | $2536.09 | 0 | 0 | N/A | $0.00 |
| J-2025-0013 | Interior painting | quoted | $9275.00 | $0.00 | 85.4 | 0 | N/A | $-9275.00 |
| J-2024-0001 | Kitchen refresh | quoted | $4070.00 | $0.00 | 47.9 | 0 | N/A | $-4070.00 |
| J-2024-0004 | Porch screen option 1 | quoted | $547.00 | $0.00 | 6.4 | 0 | N/A | $-547.00 |
| J-2024-0005 | Screen porch option 2 | quoted | $526.97 | $0.00 | 6.2 | 0 | N/A | $-526.97 |
| J-2024-0003 | Roof line deteriorating wood | quoted | $278.26 | $0.00 | 3.3 | 0 | N/A | $-278.26 |
| J-2024-0002 | 2 window sills | quoted | $188.88 | $0.00 | 2.2 | 0 | N/A | $-188.88 |
| J-2023-0012 | Continuation — apartment work | invoiced | $1044.26 | $1044.26 | 12.3 | 0 | N/A | $0.00 |
| J-2023-0011 | Apartment painting and repair | invoiced | $3995.29 | $3995.29 | 47 | 0 | N/A | $0.00 |
| J-2023-0010 | AC drain siding repair | invoiced | $250.29 | $250.29 | 2.9 | 0 | N/A | $0.00 |
| J-2023-0009 | Pantry closet shelves | invoiced | $982.39 | $982.39 | 11.6 | 0 | N/A | $0.00 |
| J-2023-0007 | Recycling bin | invoiced | $807.21 | $807.21 | 9.5 | 0 | N/A | $0.00 |
| J-2023-0005 | Chicken coop roof | invoiced | $551.88 | $551.88 | 6.5 | 0 | N/A | $0.00 |
| J-2023-0004 | Colburn Woods job | invoiced | $409.77 | $409.77 | 4.8 | 0 | N/A | $0.00 |
| J-2023-0003 | Siding, AC removal/fill, car port enclosure | invoiced | $2045.83 | $2045.83 | 24.1 | 0 | N/A | $0.00 |
| J-2023-0002 | Chicken coop | invoiced | $3732.28 | $3732.28 | 43.9 | 0 | N/A | $0.00 |
| J-2023-0001 | Walnut bedside tables | invoiced | $1414.25 | $1414.25 | 16.6 | 0 | N/A | $0.00 |

---

*Report generated automatically by `scripts/run-estimate-benchmark.ts` per TASK-095.*
