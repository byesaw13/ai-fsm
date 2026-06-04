# AI-FSM Complete Usage & Workflow Plan
## From Intake to Billing — Designed for Flow State

---

## Core Design Philosophy

**"Software as a Sidekick"** — The app should feel like a competent assistant that handles the boring stuff, surfaces what matters right now, and never gets in the way.

### Guiding Principles (from research)
1. **Max 7 visible items** at any decision point (Miller's Law)
2. **Max 2 disclosure layers** — primary action + "Advanced" or "More info"
3. **Start tasks at step 2** (Endowed Progress Effect — auto-complete the setup step)
4. **Show momentum visually** — progress fills, checkmarks, completion animations
5. **Context is king** — show only the info needed for the current moment
6. **1-2 taps for critical actions** — status updates, arrivals, completions
7. **Never let users dead-end** — always show the next step
8. **Prevent errors over correcting them** — auto-fill, sensible defaults, guardrails

---

## Role Personas

### 👤 ADMIN (Office Manager / Dispatcher)
- **Goals**: Fill the schedule, keep jobs moving, get paid fast
- **Pain points**: Forgetting follow-ups, losing track of unpaid invoices, juggling tech assignments
- **Mental model**: "What needs attention RIGHT NOW?"

### 🔧 TECHNICIAN
- **Goals**: Complete jobs well, get home on time, minimal paperwork
- **Pain points**: Clunky apps, redundant data entry, hunting for info
- **Mental model**: "What's next? What do I need to know?"

### 👑 OWNER
- **Goals**: Revenue growth, profitability, team efficiency
- **Pain points**: Not knowing margins, cash flow blind spots, tech utilization
- **Mental model**: "Is the business healthy?"

---

## Complete Pipeline: Intake → Billing

```
┌─────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐
│ INTAKE  │───▶│ ESTIMATE│───▶│ SCHEDULE │───▶│ DISPATCH │───▶│ ON-SITE  │───▶│ COMPLETE│
│  Lead   │    │  Quote  │    │  Assign  │    │  Notify  │    │  Execute │    │  Close   │
└─────────┘    └─────────┘    └──────────┘    └──────────┘    └──────────┘    └─────────┘
                                                                            │
                              ┌─────────┐    ┌──────────┐    ┌──────────┐  │
                              │ FOLLOW  │◀───│  BILL    │◀───│ INVOICE  │◀─┘
                              │  UP     │    │ COLLECT  │    │ SEND     │
                              └─────────┘    └──────────┘    └──────────┘
```

---

## Phase 1: INTAKE — "Quick Capture"

### Problem
Creating a new job currently requires: title → client → property → description → type → priority → schedule. That's 7 fields before you even save. Too much friction for "just jotting down a lead."

### Solution: Two-Speed Entry

**Speed 1: The 15-Second Job** (for phone calls, walk-ins, quick leads)
```
┌─────────────────────────────────┐
│  ⚡ Quick Job                   │
│                                 │
│  [What needs done?________]     │  ← Required, autofocus
│                                 │
│  [🔍 Search client...      ]     │  ← Typeahead, creates new if no match
│                                 │
│  [📍 Property (optional)   ]     │  ← Auto-filled if client selected
│                                 │
│         [ Create Job ]          │  ← That's it. 1 button.
└─────────────────────────────────┘
```
- Auto-sets status = `draft`, type = `custom`, priority = `0`
- No scheduling required — can be done later
- **Feels like**: Sending a text message
- **Satisfying element**: A quick "whoosh" animation + job appears in the list immediately

**Speed 2: The Full Setup** (after creation, or for planned jobs)
- Click into the draft job → sees "Job Details" card with empty fields
- Progressive disclosure: show title/client first, "More Details" reveals type/priority/schedule
- **Endowed Progress**: The job already exists (step 1 done), just filling in details now

### Error Prevention
- Client typeahead prevents typos/duplicates
- If creating new client from typeahead → opens a mini-form inline, not a new page
- Auto-saves drafts every 10 seconds

---

## Phase 2: ESTIMATE — "Quote Builder"

### Problem
Estimates feel like accounting work. Building line items is tedious. Clients don't understand estimates.

### Solution: Conversational Quote Builder

**Step 1: What's the work?** (Progressive — starts simple)
```
┌─────────────────────────────────┐
│  📋 Estimate for [Client]       │
│                                 │
│  + Add Line Item                │  ← Click to expand inline
│                                 │
│  ┌─────────────────────────┐    │
│  │ Description  [________] │    │
│  │ Qty [ 1 ]  Unit [$ __]  │    │
│  │        [Add Another]     │    │
│  └─────────────────────────┘    │
│                                 │
│  Subtotal: $XXX.XX              │
│  Tax: $XX.XX                    │
│  ─────────────                  │
│  Total: $XXX.XX                 │
│                                 │
│  [ Save Draft ] [ Send → ]      │
└─────────────────────────────────┘
```

**Smart Defaults**:
- Pulls job type → pre-suggests common line items (price book integration)
- Tax auto-calculated from company settings
- Copy from previous estimate for same job type

**Step 2: Send & Track** (satisfying visual)
```
┌─────────────────────────────────┐
│  Estimate Sent! 📨              │
│  ──────────────────             │
│  ● Draft    ● Sent    ○ Approved│  ← Progress dots animate
│                                 │
│  Sent to: client@email.com      │
│  Expires: May 18, 2026          │
│                                 │
│  [Copy Portal Link] [Remind]    │
└─────────────────────────────────┘
```
- The Zeigarnik Effect: "Sent" is active, "Approved" is gray — the gap creates a mental pull
- When approved → notification + progress completes → dopamine hit

---

## Phase 3: SCHEDULE — "Drag & Place"

### Problem
Scheduling currently happens on the visit detail page. It's a form buried in a detail page.

### Solution: Visual Schedule Board

**Admin View: Week at a Glance**
```
┌─────────────────────────────────────────────────────────────┐
│  📅 Week of May 5, 2026              [ + New Visit ]        │
├──────────┬──────────┬──────────┬──────────┬──────────┬───────┤
│  Tech    │   Mon    │   Tue    │   Wed    │   Thu    │ Fri   │
├──────────┼──────────┼──────────┼──────────┼──────────┼───────┤
│  Mike    │ 🟢 9-11  │          │ 🟢 8-10  │          │       │
│          │ Kitchen  │          │ Bathroom │          │       │
│          │          │ 🔴 2-4   │          │ 🟡 1-3   │       │
│          │          │ HVAC chk │          │ Deck     │       │
├──────────┼──────────┼──────────┼──────────┼──────────┼───────┤
│  Sarah   │          │ 🟢 9-12  │          │ 🟢 9-11  │ 🟢    │
│          │          │ Paint    │          │ Fence    │ 10-1  │
│          │ 🔴 1-3   │          │          │          │ Elec  │
│          │ Elec     │          │          │          │       │
├──────────┼──────────┼──────────┼──────────┼──────────┼───────┤
│          │          │          │          │          │       │
│ Unscheduled │ [Job A] [Job B] [Job C]                    │
│ (3)       │ Drag →  │ Drag →  │ Drag →  │ Drag →  │ Drag→ │
└──────────┴──────────┴──────────┴──────────┴──────────┴───────┘
```

**Unscheduled jobs queue at bottom** → drag to assign (satisfying physical interaction)
- Color coding: 🟢 = estimated time fits, 🟡 = tight, 🔴 = overbooked
- Clicking a visit opens a detail drawer (not a page navigation → maintains context)

**Tech View: "My Day"** (see Phase 4 for details)

---

## Phase 4: DISPATCH → ON-SITE — "Tech Flow Mode"

### The Technician's Primary Interface

This is the MOST important screen in the entire app. If this is frictionless, adoption is high. If it's clunky, everything fails.

**Current State**: Tech sees a visit list page with all visits. Has to find their visit, open it, figure out what to do.

**New State: "My Day" — One Screen, Clear Flow**

```
┌─────────────────────────────────┐
│  🔧 My Day — May 5             │
│  3 visits • 12:45pm next       │
├─────────────────────────────────┤
│                                 │
│  ✅ Kitchen Faucet Repair       │  ← Completed (collapsed)
│     9:00 AM · 123 Oak St        │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 🔵 Bathroom Remodel       │  │  ← CURRENT / NEXT (highlighted)
│  │                           │  │
│  │ ⏰ 12:45 PM - 3:30 PM     │  │
│  │ 📍 456 Elm St, Suite 2    │  │
│  │ 👤 Mrs. Johnson           │  │
│  │ 📞 (555) 123-4567         │  │
│  │                           │  │
│  │ 📋 Notes:                 │  │
│  │ Replace vanity, re-caulk  │  │
│  │ tub, check water pressure │  │
│  │                           │  │
│  │ 📸 Before photos: 0 taken │  │
│  │ ✅ Walkthrough: 0/28 done │  │
│  │                           │  │
│  │ ┌─────────┐ ┌──────────┐  │  │
│  │ │  📍     │ │  📋      │  │  │  ← BIG BUTTONS (thumb-friendly)
│  │ │ Arrive  │ │ Details  │  │  │
│  │ └─────────┘ └──────────┘  │  │
│  └───────────────────────────┘  │
│                                 │
│  🕐 Deck Stain — 5:00 PM        │  ← Upcoming (collapsed)
│     789 Pine Rd                  │
│                                 │
└─────────────────────────────────┘
```

### The Visit Flow (Progressive, Step-by-Step)

**Step 1: Arrive** (1 tap)
```
Tap "📍 Arrive" → Button pulses → Status changes to "Arrived" → Timer starts
```
- Auto-logs arrived_at timestamp
- Sends auto-SMS to client: "Your technician has arrived" (if enabled)
- Satisfying: Button turns green, subtle checkmark animation

**Step 2: Work** (contextual tools appear)
```
After arriving, the card expands with work tools:

┌──────────────────────────────┐
│  In Progress — 0:23 elapsed  │  ← Timer (optional pride element)
├──────────────────────────────┤
│                              │
│  ┌────────┐ ┌────────┐       │
│  │ 📸     │ │ ✅     │       │
│  │ Photos │ │ Check  │       │
│  │        │ │ List   │       │
│  └────────┘ └────────┘       │
│                              │
│  ┌────────┐ ┌────────┐       │
│  │ 🔩     │ │ 📝     │       │
│  │ Parts  │ │ Notes  │       │
│  │ Used   │ │        │       │
│  └────────┘ └────────┘       │
│                              │
│  [ ⏸ Pause ]  [ ✅ Complete]│
└──────────────────────────────┘
```
- Photos → opens camera → auto-tags as "before" or "after" based on visit state
- Checklist → 28-item walkthrough for maintenance, or issue-specific for repairs
- Parts → quick-add from price book or custom entry
- Notes → voice-to-text + text input (techs hate typing with gloves)

**Step 3: Complete** (the satisfying finish)
```
Tap "✅ Complete" → Review screen:

┌──────────────────────────────┐
│  Visit Complete! 🎉          │
├──────────────────────────────┤
│                              │
│  ✅ Arrived: 12:47 PM        │
│  ✅ Duration: 2h 18m         │
│  ✅ Before photos: 3         │
│  ✅ After photos: 4          │
│  ✅ Checklist: 26/28 items   │
│  ⚠️  Items marked "Needs     │
│     attention" (2)           │
│  ✅ Parts used: 3 items      │
│  ✅ Tech notes: 124 chars    │
│                              │
│  [ ✅ All Good, Close ]      │  ← Primary
│  [ 📝 Edit Something ]       │  ← Secondary
└──────────────────────────────┘
```
- **Endowed Progress**: The review shows what's already done (not what's missing)
- **Zeigarnik Effect**: The 2 flagged items create a gentle pull — "should I fix those?"
- But no blocking — tech CAN close even with warnings (don't frustrate)
- Auto-syncs → visit status = "completed" → admin sees immediately

---

## Phase 5: COMPLETE → INVOICE — "Auto-Generate"

### Problem
Creating an invoice manually from scratch is tedious and error-prone.

### Solution: One-Click Invoice from Completed Job

**On Job Detail Page** (admin view):
```
Job: Bathroom Remodel     Status: ● Completed

┌─────────────────────────────────┐
│  💰 Ready to Invoice            │
│                                 │
│  Approved estimate: $2,450.00   │
│  Parts used during visits: $187.50│
│                                 │
│  [ Create Invoice → ]           │  ← Pre-fills from estimate + parts
└─────────────────────────────────┘
```

**Invoice is auto-created with**:
- Line items from approved estimate
- Additional parts used during visits (as separate line items)
- Labor costs if tracked
- Status = `draft` (so admin can review before sending)

**Admin reviews → clicks "Send"**:
```
┌─────────────────────────────────┐
│  Invoice Sent! 📨               │
│  ──────────────────             │
│  ● Draft    ● Sent    ○ Paid    │  ← Progress dots
│                                 │
│  $2,637.50 due by May 19        │
│  Sent to: mrs.johnson@email.com │
│                                 │
│  [Copy Link] [ Remind ]         │
└─────────────────────────────────┘
```

---

## Phase 6: BILL → COLLECT — "Follow-Up Autopilot"

### Problem
Invoices get forgotten. Nobody likes chasing money.

### Solution: Automated Payment Pipeline

```
Invoice sent → Day 3 auto-reminder → Day 7 final notice → Day 14 escalation

Admin sees at a glance:
┌─────────────────────────────────┐
│  💵 Outstanding: $8,432.50      │
│                                 │
│  $3,200.00  Due this week       │  ← Green
│  $4,100.00  Overdue             │  ← Red (3 invoices)
│  $1,132.50  Partially paid      │  ← Yellow
│                                 │
│  [Send Reminders to 3] →       │  ← One-click batch action
└─────────────────────────────────┘
```

**Recording a Payment** (should feel rewarding):
```
┌──────────────────────────────┐
│  Payment Recorded! ✅        │
├──────────────────────────────┤
│                              │
│  Invoice #INV-0042           │
│  Amount: $1,200.00           │
│  Balance: $0.00 ✅ PAID      │
│                              │
│  ━━━━━━━━━━━━━━━━━━━━ 100%   │  ← Progress bar fills to 100%
│                              │
│  [Record Another] [Done]     │
└──────────────────────────────┘
```
- The progress bar animating to 100% = satisfying completion signal
- "PAID" badge appears with a subtle green flash

---

## Phase 7: EXPENSE & MILEAGE — "Frictionless Side-Tasks"

### Problem
Expense tracking is the #1 thing people skip. It feels like homework.

### Solution: Capture in the Flow of Work

**Mileage: Auto-Suggest from Visits**
```
End of day prompt (tech view):

┌──────────────────────────────┐
│  🚗 Log Today's Miles?       │
├──────────────────────────────┤
│                              │
│  Route: Home → Oak St →      │
│  Elm St → Pine Rd → Home     │
│                              │
│  Estimated: 47.3 miles       │  ← Auto-calculated from visit addresses
│                              │
│  [ ✅ Log It ]  [ ✏️ Edit ]  │  ← One tap to accept
│  [ Skip for now ]            │
└──────────────────────────────┘
```
- Uses visit addresses to estimate driving route
- Tech just confirms or adjusts — no manual entry
- If skipped → gentle reminder next morning ("Don't forget yesterday's miles!")

**Expenses: Photo-First Capture**
```
┌──────────────────────────────┐
│  📸 Snap a Receipt           │
├──────────────────────────────┤
│                              │
│  [ 📷 Take Photo ]           │
│  [ 🖼️ From Gallery ]         │
│                              │
│  Or enter manually:          │
│  Vendor: [____________]      │
│  Amount: [ $ ___  ]          │
│  Category: [Materials ▼]     │
│  Job: [optional ▼]           │
│                              │
│  [ Save Expense ]            │
└──────────────────────────────┘
```
- Photo receipt → OCR extracts vendor + amount (future enhancement)
- Quick-add from job detail page: "Used materials → log as expense"
- Monthly summary shows total + breakdown → "You tracked $847 in expenses this month"

---

## Phase 8: PROFITABILITY — "Silent Intelligence"

### Problem
Most small contractors don't know their real margins until tax time.

### Solution: Zero-Input Profitability Tracking

**Auto-calculated from existing data**:

```
┌─────────────────────────────────┐
│  📊 Job: Bathroom Remodel       │
├─────────────────────────────────┤
│                                 │
│  Revenue     $2,637.50          │
│  Cost        $1,142.00          │
│  ──────────────                 │
│  Profit      $1,495.50          │
│  Margin         57%  ████░░░░  │  ← Visual bar
│                                 │
│  Cost breakdown:                │
│  Materials    $487.50  (43%)    │
│  Labor        $520.00  (46%)    │
│  Mileage      $ 34.50  ( 3%)    │
│  Overhead     $100.00  ( 8%)    │
│                                 │
│  vs. Avg: +12% 📈               │  ← Benchmark
└─────────────────────────────────┘
```

**Owner Dashboard — "Business Health"**:
```
┌─────────────────────────────────┐
│  🏢 This Month                  │
├─────────────────────────────────┤
│                                 │
│  Revenue    $24,500  ━━ 108%    │  ← vs. last month
│  Expenses   $ 8,432             │
│  Net        $16,068  ━━ 122%    │
│  Margin        66%  ███████░░░  │
│                                 │
│  Jobs Completed    18           │
│  Avg Job Value     $1,361       │
│  Tech Utilization  84%          │
│                                 │
│  Top Performer: Mike ($6,200)   │
│  Needs Attention: 2 overdue inv │
└─────────────────────────────────┘
```
- Zero manual entry — pulls from invoices, expenses, mileage, visits
- Benchmarks against historical data
- Highlights anomalies (job margins way below average)

---

## Implementation Priority Order

### Sprint 1: Foundation
1. **Quick Job** (15-second intake) — refactor job creation flow
2. **Tech "My Day"** view — replace visits list with focused daily view
3. **Visit Flow** (Arrive → Work → Complete) with big buttons and progress
4. **Progress indicators** on jobs (stepper + completion animations)

### Sprint 2: Automation
5. **Auto-invoice from estimate** — one-click creation
6. **Invoice payment tracking** with progress bars
7. **Batch reminders** for overdue invoices
8. **Mileage auto-suggest** from visit addresses

### Sprint 3: Intelligence
9. **Profitability dashboard** — auto-calculated margins
10. **Job-level profitability** card on job detail
11. **Expense photo capture** flow
12. **End-of-day wrap-up** prompt for techs

### Sprint 4: Polish
13. **Voice-to-text** for tech notes
14. **Notification system** (SMS/email auto-reminders)
15. **Completion animations** across all status transitions
16. **Offline support** for tech mobile flow

---

## What Makes This "Fun"

1. **Completion momentum**: Every action fills a progress bar, checks a box, or advances a stepper
2. **Satisfying transitions**: Buttons pulse, checkmarks animate, bars fill smoothly
3. **Auto-completion**: The system does the boring stuff (timestamps, calculations, suggestions)
4. **Visible progress**: Techs see their day filling up with checkmarks → sense of accomplishment
5. **Smart defaults**: Less typing, more doing
6. **Zero dead-ends**: Every screen shows "what's next"
7. **Data that works for you**: Profitability appears automatically, not as a chore
