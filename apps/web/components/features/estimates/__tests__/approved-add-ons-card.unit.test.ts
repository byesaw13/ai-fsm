import { describe, it, expect } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The component is compiled with the classic JSX runtime under vitest.
(globalThis as { React?: typeof React }).React = React;

import { ApprovedAddOnsCard } from "../ApprovedAddOnsCard";

describe("ApprovedAddOnsCard (TASK-225)", () => {
  it("lists what the customer added and the extra amount", () => {
    const html = renderToStaticMarkup(createElement(ApprovedAddOnsCard, { addOns: [{ id: "a2", label: "Foyer stairwell", price_cents: 105_000 }] }));
    expect(html).toContain("Customer added at approval");
    expect(html).toContain("Foyer stairwell");
    expect(html).toContain("$1,050.00");
  });

  it("renders nothing when no add-on was chosen", () => {
    expect(renderToStaticMarkup(createElement(ApprovedAddOnsCard, { addOns: null }))).toBe("");
    expect(renderToStaticMarkup(createElement(ApprovedAddOnsCard, { addOns: [] }))).toBe("");
  });
});
