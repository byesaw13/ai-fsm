# Product

## Register

product

## Users

Three roles share one operating system; the UI must serve all three without fragmenting into separate products.

- **Owner/Admin** — reviews intake, prices work, schedules visits, invoices clients, and carries business risk. Works across phone (in the field) and desktop (pricing, scheduling, billing). Needs trustworthy numbers and visible review state.
- **Office/Admin** — keeps clients, estimates, invoices, and follow-ups moving. Primarily desktop; values speed through repetitive coordination.
- **Technician** — sees assigned visits, executes work, and records notes, materials, photos, and completion. **The dominant real-world context: a phone, outdoors, one-handed** — sunlight glare, gloves, intermittent attention. Minimal typing, large targets, one-tap actions.

## Product Purpose

Dovetails FSM runs a small residential handyman business from first request through paid invoice and a permanent property record. The product center is the relationship between a **client** and a **property**: jobs, visits, estimates, invoices, photos, notes, and completion records accumulate into a useful, lasting service history for each home.

Success looks like: new requests captured without duplicate or ambiguous work; accurate estimates with pricing guardrails and visible review state; visits executed with the right information on site; completed work converted cleanly into invoices and payment history — all without multiplying dashboards or product concepts.

## Brand Personality

**Sturdy · Direct · Earned-trust.**

A craftsman's tool, not a SaaS product. Rugged and dependable; plainspoken labels over clever ones; nothing decorative that doesn't carry weight. The interface should feel like well-kept equipment — solid, legible, ready to work in any condition — and it earns trust the way a tradesperson does: by being accurate, consistent, and honest about state (what's done, what's owed, what's pending). Confidence without polish-for-its-own-sake. The tool recedes so the work and the property history stay in focus.

## Anti-references

- **Generic SaaS / dashboard suites.** Not a wall of KPI cards, gradient hero-metrics, or a "command center" of widgets. The product deliberately resists multiplying dashboards (canonical Product Boundaries). One daily home, not five overlapping surfaces.
- **AI-first estimating products.** AI may assist, but the UI must not present as an "AI estimator." Pricing and service records are the product; AI is a quiet helper, never the headline.
- **Membership / subscription platforms.** No upsell scaffolding, plan-tier framing, or membership-first navigation.
- **Multi-company field-service platforms.** This is one business's operating system, not a configurable generic FSM. Avoid the abstract, settings-heavy, "platform" feel.
- **Consumer-app gloss.** No playful illustration, mascots, or trend-chasing decoration. Earned trust, not delight-for-its-own-sake.

## Design Principles

1. **Field-first, one-tap.** Any action done more than ~5×/day should be reachable in one tap. Reduce typing, modals, and navigation; favor large targets and direct controls. When field reality and software purity disagree, field reality wins.
2. **The tool recedes; the record persists.** The UI is calm and quiet so the client↔property service history stays the focus. Chrome earns its pixels or disappears.
3. **One operational record feeds every function.** A single source of truth per fact (time, mileage, materials, presence); surfaces reference and summarize, never duplicate. Reflect that in the UI — no contradictory copies of the same number across screens.
4. **Honest state, trustworthy money.** Always show what's done, owed, pending, or under review. Money and lifecycle status render consistently and unambiguously everywhere they appear.
5. **Sturdy over slick.** Choose the legible, durable solution over the fashionable one. Dependability and clarity beat ornament; every element should hold up one-handed in sunlight.

## Accessibility & Inclusion

- **Target: WCAG 2.2 AA, plus field legibility.** Standard AA contrast, focus visibility, and keyboard operability across the app — and beyond that, extra-high contrast and generous touch targets tuned for sunlight glare and gloved, one-handed phone use in the field.
- Body text ≥ 4.5:1; large/bold text ≥ 3:1; never rely on light-gray-on-tint for anything readable.
- Touch targets ≥ 44px; primary field actions larger still.
- Status is never conveyed by color alone (label/icon + color), important given heavy use of status pills.
- Respect `prefers-reduced-motion` with a crossfade/instant fallback on every animation.
