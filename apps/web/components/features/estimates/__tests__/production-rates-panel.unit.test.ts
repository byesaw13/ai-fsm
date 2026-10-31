import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/ui", () => ({
  Button: (p: { children?: unknown }) => createElement("button", null, p.children as never),
  Input: (p: Record<string, unknown>) => createElement("input", p),
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

// The component is compiled with the classic JSX runtime under vitest.
(globalThis as { React?: typeof React }).React = React;

import { ProductionRatesPanel } from "../ProductionRatesPanel";

describe("ProductionRatesPanel (TASK-193)", () => {
  const html = renderToStaticMarkup(
    createElement(ProductionRatesPanel, {
      initialHoursPerDay: 8,
      initialRates: [{
        id: "r1", service_code: "5012", service_name: "Interior room painting", scope_component_key: "wall_sqft",
        base_rate: 400, rate_unit: "sqft_per_day", notes: null, calibrated: false, calibrated_at: null,
        modifiers: [{ id: "m1", complexity_factor_key: "occupied_home", modifier_pct: -0.1, notes: null, calibrated: true, calibrated_at: "2026-10-31" }],
      }],
    }),
  );

  it("shows each rate with its hourly conversion at the hours-per-day setting", () => {
    expect(html).toContain("5012");
    expect(html).toContain("400 sq ft a day = 50 sq ft an hour at 8 h a day");
    expect(html).toContain('value="400"');
  });

  it("shows modifiers with their percentage and calibration", () => {
    expect(html).toContain("occupied home");
    expect(html).toContain('value="-10"');
    expect(html).toContain("-10% (slower)");
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
  });
});
