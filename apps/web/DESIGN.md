---
name: Dovetails FSM
description: A sturdy, field-first operating system for a residential handyman business — Forest & Cedar.
colors:
  forest-800: "#166534"
  forest-700: "#15803d"
  forest-900: "#14532d"
  forest-50: "#e9f6ee"
  stone-950: "#0c0a09"
  stone-900: "#1c1917"
  stone-600: "#57534e"
  stone-500: "#78716c"
  stone-300: "#d6d3d1"
  stone-200: "#e7e5e4"
  stone-100: "#f5f5f4"
  stone-50: "#fafaf9"
  white: "#ffffff"
  danger-600: "#dc2626"
  warning-600: "#d97706"
  success-600: "#16a34a"
  info-600: "#2563eb"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.375
  mono:
    fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "3px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
  12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.forest-800}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.forest-700}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.stone-900}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.danger-600}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.stone-900}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.stone-900}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  badge:
    backgroundColor: "{colors.stone-100}"
    textColor: "{colors.stone-600}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: Dovetails FSM

## 1. Overview

**Creative North Star: "The Well-Kept Toolbox"**

Dovetails FSM looks and feels like a craftsman's well-kept toolbox: every control is solid, labeled, and in its place; nothing is decorative that doesn't carry weight. This is a *product* register — the design serves the work of running a residential handyman business, it does not perform. The interface recedes so the real subject (the client↔property service history, what's done, what's owed) stays in focus. The identity is **"Forest & Cedar"**: a deep forest-green accent used sparingly, set on warm stone neutrals — a trade brand, not a generic SaaS.

Density is deliberate. The base text size is 15px (smaller than the typical 16px) because owners and office staff scan a lot of structured information — clients, estimates, line items, invoices, schedules — and the layout favors getting more honest data on screen over airy marketing whitespace. At the same time, the dominant real-world context is a **technician on a phone, outdoors, one-handed**, so anything they touch in the field must be high-contrast and large-target. The system holds both: dense and desk-efficient where coordination happens, bold and one-tap where the field happens.

What it explicitly rejects: the SaaS dashboard suite (walls of KPI cards, gradient hero-metrics, a "command center" of widgets), AI-first estimator framing, membership/subscription scaffolding, the abstract multi-company "platform" feel, and consumer-app gloss. Sturdy over slick, always.

**Key Characteristics:**
- Forest-green accent on warm stone neutrals; green earns its place, it doesn't flood the screen.
- Dense, legible, information-first layout — desk-efficient, never cramped in the field.
- Status is everywhere (pills for estimates, invoices, visits) and never color-only.
- Calm chrome, flat-by-default surfaces; depth appears only on interaction.
- One number, one source of truth — money and lifecycle state render identically wherever they appear.

## 2. Colors

A restrained palette: one forest-green accent carries identity at ≤10% of any screen, set on a warm-stone neutral ramp, with four reserved status hues that never get used as decoration.

### Primary
- **Forest 800** (`#166534`): The brand accent. Primary buttons, active nav, focus rings, key links. Deliberately *rare* — it marks the one important action or the live state, not every surface.
- **Forest 700** (`#15803d`): Hover/active state of the accent; the slightly brighter press response.
- **Forest 900** (`#14532d`) / **Forest 50** (`#e9f6ee`): Deepest green for text-on-light emphasis; the pale tint for accent-subtle backgrounds and the 3px focus glow.

### Neutral (warm stone)
- **Stone 900** (`#1c1917`): Primary text/ink. Warm near-black, not pure gray.
- **Stone 600** (`#57534e`): Secondary text — labels, metadata. Passes AA on white (≈7:1).
- **Stone 500** (`#78716c`): Muted text — timestamps, placeholders. Use only where AA still holds; never for body copy.
- **Stone 200** (`#e7e5e4`) / **Stone 300** (`#d6d3d1`): Borders and dividers (default / strong).
- **Stone 50** (`#fafaf9`): App background. **White** (`#ffffff`): cards and elevated surfaces.

### Status (reserved — never decorative)
- **Success 600** (`#16a34a`): paid, approved, completed.
- **Info 600** (`#2563eb`): sent, scheduled, in-progress, arrived. *Scheduled stays blue on purpose* so it can never be misread as approved/paid green now that the accent itself is green.
- **Warning 600** (`#d97706`): partial, expired, high-priority.
- **Danger 600** (`#dc2626`): overdue, declined, destructive actions, urgent.

### Named Rules
**The Green-Is-Earned Rule.** Forest accent covers ≤10% of any screen. It marks the single primary action or the live operational state — nothing else. If two greens compete on a screen, one of them is wrong.

**The Status-Never-Decorates Rule.** The four status hues mean exactly one thing each (paid/sent/partial/overdue families). Never reuse a status color as an accent or background flourish — a green card must mean "good," not "pretty."

## 3. Typography

**Display / Body Font:** System sans — `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif`. One family across the whole hierarchy, differentiated by weight and size.
**Label/Mono Font:** `'SF Mono', 'Fira Code', monospace` — for IDs, money columns, and tabular figures where alignment matters.

**Character:** Plainspoken and operational. A single neutral grotesque carries everything; there is no display-serif flourish because the product is a tool, not a magazine. Weight (600/700) and size do the hierarchy work, keeping the type system as sturdy and predictable as the rest of the toolbox.

### Hierarchy
- **Display** (700, 1.875rem/30px, 1.25, -0.02em): Page titles only (one per screen).
- **Headline** (700, 1.5rem/24px, 1.25, -0.01em): Major section headers.
- **Title** (600, 1.125rem/18px, 1.375): Card and panel headers, list-row primary text.
- **Body** (400, 0.9375rem/15px, 1.5): Default text. Cap prose at 65–75ch; most app text is structured and shorter.
- **Label** (600, 0.8125rem/13px, 1.375): Form labels, button text, table headers, badges.
- **Mono** (400, 0.8125rem/13px): Money, IDs, quantities — anywhere figures must line up.

### Named Rules
**The One-Family Rule.** Do not introduce a second typeface. Hierarchy comes from weight and size, not from font pairing — a second family reads as decoration this register doesn't want.

## 4. Elevation

Flat-by-default with a subtle, layered shadow vocabulary reserved for genuine elevation. Surfaces sit on the stone background separated primarily by a 1px stone border and tonal contrast (white card on stone-50 bg), not by heavy drop shadows. Shadows are soft and low-opacity (4–8% black); they signal "this lifted" on hover or "this floats above" for overlays — never ambient decoration.

### Shadow Vocabulary
- **Resting card** (`box-shadow: 0 1px 2px rgba(0,0,0,0.04)` — `--shadow-xs`): The default card lift, barely there.
- **Hover lift** (`box-shadow: 0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.04)` — `--shadow-md`): Interactive cards on hover.
- **Overlay** (`box-shadow: 0 10px 15px rgba(0,0,0,0.06), 0 4px 6px rgba(0,0,0,0.04)` — `--shadow-lg`): Dropdowns, popovers.
- **Modal** (`box-shadow: 0 20px 25px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.04)` — `--shadow-xl`): Dialogs above the backdrop.

### Named Rules
**The Border-Then-Shadow Rule.** Separation is a 1px stone border first; shadow second, and only when something is genuinely elevated or interactive. Never pair a 1px border with a wide (≥16px) soft drop shadow on the same resting element — pick one.

## 5. Components

### Buttons
- **Shape:** `--radius-md` (8px). Compact: `8px 16px` padding, 13px semibold label, `gap: 8px` for icon+text.
- **Primary:** Forest-800 background, white text, matching border. Hover → Forest-700. The single most important action on a screen.
- **Secondary:** White background, stone-900 text, stone-200 border. Hover → stone-50 fill + stone-300 border. The default for everything that isn't *the* action.
- **Danger:** Danger-600 background, white text — destructive/irreversible only.
- **Focus:** 3px forest-subtle ring (`box-shadow: 0 0 0 3px` accent-subtle), never a removed outline.

### Cards / Containers
- **Corner Style:** `--radius-lg` (12px). Cards top out here — never 24px+.
- **Background:** White on the stone-50 app background.
- **Shadow Strategy:** `--shadow-xs` at rest; `.p7-card-hover` lifts to `--shadow-md` + stone-300 border on hover. See Elevation.
- **Border:** 1px stone-200.
- **Internal Padding:** `--space-6` (24px) typical; tighter in dense lists.
- **Never nest cards.** A card inside a card is always the wrong structure here.

### Inputs / Fields
- **Style:** White fill, 1px stone-200 border, `--radius-md` (8px), 13px text, `9px 12px` padding.
- **Hover:** border → stone-300. **Focus:** border → Forest-800 + 3px forest-subtle glow.
- **Error:** danger-600 border; disabled: reduced opacity, `not-allowed`.

### Badges / Status Pills
- **Style:** Full-pill (`--radius-full`), `2px 8px`, 13px semibold. Tinted background + matching darker foreground from the status family (e.g. paid → green-100 bg / green-600 fg).
- **Rule:** Always pair the color with a text label or icon — status is never conveyed by color alone.

### Navigation
- **Style:** 240px fixed sidebar (64px collapsed), 60px top header. Stone surfaces; active item carries the Forest accent (text/indicator), inactive is stone-600. On mobile the sidebar collapses; field surfaces (My Day) promote one-tap actions over nav depth.

### Signature Component — Status Stepper
The estimate/invoice/visit lifecycle is shown as a horizontal stepper (`StatusStepper`) using the reserved status hues, so the honest state of any record (draft → sent → approved → invoiced → paid) is legible at a glance without reading copy.

## 6. Do's and Don'ts

### Do:
- **Do** keep the Forest accent to ≤10% of any screen — one primary action or the live state. Everything else is stone.
- **Do** pair every status color with a label or icon; status is never color-only (WCAG 2.2 AA + field legibility).
- **Do** separate surfaces with a 1px stone border first, shadow only on real elevation/hover.
- **Do** size field-facing touch targets ≥44px and lean on high contrast — the technician is outdoors, one-handed, in glare.
- **Do** render money and lifecycle state identically everywhere (one source of truth); use mono figures for aligned money columns.
- **Do** keep `prefers-reduced-motion` fallbacks (crossfade/instant) on every transition.

### Don't:
- **Don't** build the SaaS dashboard suite — no walls of KPI cards, no gradient hero-metrics, no "command center" of widgets. One daily home, not five overlapping surfaces.
- **Don't** present as an AI-first estimator; AI is a quiet helper, never the headline.
- **Don't** add membership/subscription or multi-company "platform" scaffolding.
- **Don't** round cards past 16px, or pair a 1px border with a ≥16px soft drop shadow on a resting element.
- **Don't** introduce a second typeface or use Forest green as decoration; weight/size make hierarchy, green marks action.
- **Don't** use light-gray (stone-500) for body copy or placeholders where it drops below 4.5:1 — bump toward stone-600/900.
- **Don't** use side-stripe borders, gradient text, or decorative glassmorphism.
