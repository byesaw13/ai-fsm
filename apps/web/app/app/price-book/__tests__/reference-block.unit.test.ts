import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReferenceBlock, type ReferenceService } from "../ReferenceBlock";

// Made-up figures; no licensed Craftsman values in tests.
const service: ReferenceService = {
  default_labor_hours: 1,
  labor_hours_low: 0.75,
  labor_hours_typical: 1,
  labor_hours_high: 1.5,
  reference_hours: [],
};

const render = (s: ReferenceService) => renderToStaticMarkup(createElement(ReferenceBlock, { service: s }));

describe("ReferenceBlock", () => {
  it("renders nothing for a code without reference lines", () => {
    expect(render(service)).toBe("");
    expect(render({ ...service, reference_hours: [{ bad: true }] })).toBe("");
  });

  it("shows each cited line beside our hours, labelled reference only", () => {
    const html = render({
      ...service,
      reference_hours: [
        {
          source: "craftsman",
          book: "Test Book",
          line: "Widget, replace",
          unit: "Ea",
          install_hours: 0.5,
          remove_hours: 0.25,
          minimum_hours: 2,
          includes: "bolts",
          captured_on: "2026-10-27",
        },
      ],
    });
    expect(html).toContain("Reference (Craftsman)");
    expect(html).toContain("Reference only. Your hours are used on quotes.");
    expect(html).toContain("0.75 / 1 / 1.5 h (low / typical / high)");
    expect(html).toContain("Widget, replace");
    expect(html).toContain("Install 0.5 h each");
    expect(html).toContain("swap 0.75 h each");
    expect(html).toContain("trade minimum 2 h");
    expect(html).toContain("Includes: bolts");
  });
});
