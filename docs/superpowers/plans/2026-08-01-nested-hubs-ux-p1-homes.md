# Nested Hubs UX P1 — Home Surfaces Implementation Plan

> **For agentic workers:** P0 shell is shipped. This plan is Home chrome only.

**Goal:** Align My Day and Overview with nested-hubs T3 field focus + what-needs-you patterns without changing domain/API contracts.

**Architecture:** Presentational CSS (`.p7-field-hero`, `.p7-field-sheet`) + home component restyles. Reuse existing Start My Day / arrival / hero data paths.

**Tech Stack:** Next.js, React client components, existing Vitest/Playwright.

---

### Shipped in this PR

- [x] T3 field hero styles in `layout.css`
- [x] My Day start card as field hero
- [x] Start My Day wizard as near-full-screen field sheet
- [x] NextVisitHero dark “Right now / Next visit” hero with Confirm-first primary
- [x] ArrivalProposalBanner propose → Confirm / Not this job
- [x] Overview title + top `WhatNext` from first action-queue item
- [x] ActionQueue “Start here” primary row + 52px touch targets
- [x] E2E: Dashboard → Overview label updates

### Out of scope (P2+)

- Full T1 list templates for Work/People/Money
- Breadcrumbs on all entity pages
- Schedule T5 boards
