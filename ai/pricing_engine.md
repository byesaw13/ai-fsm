# Pricing Engine Methodology: Dovetails FSM

## 1. Single Source of Truth
All exact monetary values, block fees, hourly rates, markups, and multipliers originate strictly from code:
👉 **[packages/domain/src/dovetails.ts](file:///home/nick/ai-fsm-deploy-clean/packages/domain/src/dovetails.ts)**

**Do not hardcode or duplicate pricing constants elsewhere.**

## 2. Core Pricing Methodology
The estimate engine computes bid pricing based on the following model rules:

- **Labor Time & Materials (T&M)**: Calculated by multiplying the technician labor hours by the customer hourly rate constant.
- **Service Fees**: Dispatched visits start with a base service fee floor to protect dispatch margin.
- **Labor Blocks**: Field visits are grouped into half-day or full-day blocks for scheduling stability, overriding hourly rates where applicable.
- **Bundle Discounts**: Multi-service estimates receive a percentage discount to pass coordination savings back to the client.
- **State Surcharges**: Massachusetts-based properties incur a percentage labor delta surcharge to offset local regulatory and compliance overhead.

## 3. Materials Handling & Markup
- **Handling Fee**: A client-facing percentage handling fee is appended to all material items sourced for a job.
- **Tiered Materials Markup**: Materials purchased on behalf of the customer are marked up dynamically using a tiered system (low-cost materials below a certain threshold are bundled into labor; medium and high-cost items receive separate percentage markups).

## 4. Emergency Dispatches
Dispatches marked as emergencies receive multipliers (e.g. 1.5x, 1.75x, 2.0x) based on the target time window (business hours, nights, or weekends/holidays).
