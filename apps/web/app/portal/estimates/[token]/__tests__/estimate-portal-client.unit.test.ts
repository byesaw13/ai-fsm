import { describe, it, expect } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The component is compiled with the classic JSX runtime under vitest.
(globalThis as { React?: typeof React }).React = React;

import { EstimatePortalClient } from "../EstimatePortalClient";

const ESTIMATE = {
  status: "sent", presentation_mode: "standard" as const, subtotal_cents: 176_721, tax_cents: 0, total_cents: 176_721,
  deposit_cents: 0, notes: null, scope_assumptions: null, expires_at: null, responded_at: null, client_approved_name: null,
  client_name: "Pat Client", property_address: null, property_city: null, property_state: null, property_zip: null, account_name: "Dovetails",
};

const line = (id: string, description: string, quantity: string, unit: number, total: number, show: boolean) => ({
  id, estimate_id: "e1", option_id: null, description, quantity, unit_price_cents: unit, total_cents: total, show_quantity_and_rate: show,
});

describe("EstimatePortalClient (TASK-224)", () => {
  const html = renderToStaticMarkup(
    createElement(EstimatePortalClient, {
      token: "tok",
      estimate: ESTIMATE,
      readOnly: true,
      lineItems: [
        line("l1", "Living room — labor", "16.25", 9045, 146_971, false),
        line("l2", "Living room — materials allowance", "1.00", 29_750, 29_750, true),
      ],
      addOns: [
        { id: "a1", label: "Foyer stairwell", note: "Same open space as the foyer", price_cents: 105_000 },
        { id: "a2", label: "Trim touch-ups", note: null, price_cents: null },
      ],
    }),
  );

  it("shows labor as an amount, with no hours or rate", () => {
    expect(html).toContain("Living room — labor");
    expect(html).toContain("$1,469.71");
    expect(html).not.toContain("16.25");
    expect(html).not.toContain("$90.45");
    expect(html).toContain("$297.50");
  });

  it("lists add-ons in their own block with price and note, outside the total", () => {
    expect(html).toContain("Optional add-ons");
    expect(html).toContain("Not included in the total above.");
    expect(html).toContain("Foyer stairwell");
    expect(html).toContain("Same open space as the foyer");
    expect(html).toContain("+$1,050.00");
    expect(html).toContain("Price on request");
    expect(html).toContain("$1,767.21");
  });

  it("shows no add-ons block when there are none", () => {
    const plain = renderToStaticMarkup(createElement(EstimatePortalClient, { token: "tok", estimate: ESTIMATE, readOnly: true, lineItems: [] }));
    expect(plain).not.toContain("Optional add-ons");
  });
});

describe("EstimatePortalClient add-on approval (TASK-225)", () => {
  it("tells a customer who can still approve that add-ons can be ticked then", () => {
    const html = renderToStaticMarkup(
      createElement(EstimatePortalClient, {
        token: "tok", estimate: ESTIMATE, readOnly: false, lineItems: [],
        addOns: [{ id: "a2", label: "Foyer stairwell", note: null, price_cents: 105_000 }],
      }),
    );
    expect(html).toContain("You can add any of these when you approve.");
  });
});

