import { describe, expect, it } from "vitest";
import {
  computeDoorHardwareTakeoff,
  mergeDoorHardwareTakeoffIntoShoppingList,
  packageCeil,
  includesDoorHardwareCode,
  priceBookCodesFromLineRows,
  serviceCodesForSnapshots,
} from "./door-hardware-1007";
import type { ShoppingList } from "../scope";

describe("packageCeil", () => {
  it("rounds up to whole packages", () => {
    expect(packageCeil(8, 50, 1)).toBe(1);
    expect(packageCeil(51, 50, 1)).toBe(2);
    expect(packageCeil(0, 50, 1)).toBe(0);
  });
});

describe("computeDoorHardwareTakeoff", () => {
  it("returns incomplete for non-positive unitCount", () => {
    const r = computeDoorHardwareTakeoff({
      hardwareType: "lockset",
      unitCount: 0,
      customerSupplied: false,
    });
    expect(r.status).toBe("incomplete");
    expect(r.items).toHaveLength(0);
  });

  it("includes lockset when Dovetails supplies", () => {
    const r = computeDoorHardwareTakeoff({
      hardwareType: "lockset",
      unitCount: 2,
      customerSupplied: false,
    });
    expect(r.status).toBe("ok");
    expect(r.items.some((i) => i.name.toLowerCase().includes("lockset"))).toBe(true);
    expect(r.items.every((i) => i.service_code === "1007")).toBe(true);
    const screws = r.items.find((i) => i.name.includes("Wood screws"));
    expect(screws?.units_to_order).toBe(1); // 16 screws → 1 box of 50
  });

  it("omits primary hardware when customer-supplied but keeps consumables", () => {
    const r = computeDoorHardwareTakeoff({
      hardwareType: "lockset",
      unitCount: 1,
      customerSupplied: true,
    });
    expect(r.status).toBe("ok");
    expect(r.items.some((i) => i.name.toLowerCase().includes("lockset"))).toBe(false);
    expect(r.items.some((i) => i.name.includes("strike plate"))).toBe(true);
    expect(r.items.some((i) => i.name.includes("Wood screws"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("customer-supplied"))).toBe(true);
  });

  it("hinge-only uses 3 hinges per door and skips strike plate", () => {
    const r = computeDoorHardwareTakeoff({
      hardwareType: "hinge",
      unitCount: 1,
      customerSupplied: false,
    });
    const hinges = r.items.find((i) => i.name.toLowerCase().includes("hinge"));
    expect(hinges?.units_to_order).toBe(3);
    expect(r.items.some((i) => i.name.includes("strike plate"))).toBe(false);
  });
});

describe("mergeDoorHardwareTakeoffIntoShoppingList", () => {
  it("is idempotent — re-merge replaces 1007 specified items", () => {
    const first = computeDoorHardwareTakeoff({
      hardwareType: "lockset",
      unitCount: 1,
      customerSupplied: false,
    });
    const once = mergeDoorHardwareTakeoffIntoShoppingList(null, first);
    const second = computeDoorHardwareTakeoff({
      hardwareType: "lockset",
      unitCount: 2,
      customerSupplied: false,
    });
    const twice = mergeDoorHardwareTakeoffIntoShoppingList(once, second);
    const locksets = twice.sections
      .flatMap((s) => s.specified_items)
      .filter((i) => i.service_code === "1007" && i.name.toLowerCase().includes("lockset"));
    expect(locksets).toHaveLength(1);
    expect(locksets[0].units_to_order).toBe(2);
  });

  it("preserves non-1007 specified items", () => {
    const base: ShoppingList = {
      sections: [
        {
          section: "Plumbing",
          computed_items: [],
          specified_items: [
            {
              name: "Wax Ring",
              sku: null,
              coverage_per_unit: 1,
              unit_label: "each",
              unit_cost_cents: null,
              quantity_needed: 1,
              waste_factor: 1,
              units_to_order: 1,
              store_section: "Plumbing",
              service_code: "2001",
              notes: null,
            },
          ],
          section_total_cents: 0,
        },
      ],
      total_catalog_cost_cents: 0,
      total_specified_cost_cents: 0,
      generated_at: new Date().toISOString(),
    };
    const takeoff = computeDoorHardwareTakeoff({
      hardwareType: "handle",
      unitCount: 1,
      customerSupplied: false,
    });
    const merged = mergeDoorHardwareTakeoffIntoShoppingList(base, takeoff);
    expect(merged.sections.some((s) => s.section === "Plumbing")).toBe(true);
    expect(merged.sections.some((s) => s.section === "Hardware & Fasteners")).toBe(true);
  });
});

describe("includesDoorHardwareCode", () => {
  it("detects 1007", () => {
    expect(includesDoorHardwareCode(["5002", "1007"])).toBe(true);
    expect(includesDoorHardwareCode(["5002"])).toBe(false);
  });
});

describe("priceBookCodesFromLineRows", () => {
  it("prefers the joined price-book code over the description fallback", () => {
    expect(
      priceBookCodesFromLineRows([
        { code: "1007", description: "1007 — Door hardware replacement" },
        { code: null, description: "5002 — Interior painting" },
      ]),
    ).toEqual(["1007", "5002"]);
  });
});

describe("serviceCodesForSnapshots", () => {
  it("matches unlinked snapshots to same-category line items in order", () => {
    expect(serviceCodesForSnapshots(
      [{ category: "general_repairs", service_code: null }, { category: "general_repairs", service_code: null }],
      [{ category: "general_repairs", code: "1007" }, { category: "general_repairs", code: "1001" }],
    )).toEqual(["1007", "1001"]);
  });

  it("does not guess when same-category line and snapshot counts differ", () => {
    expect(serviceCodesForSnapshots(
      [{ category: "general_repairs", service_code: null }],
      [{ category: "general_repairs", code: "1007" }, { category: "general_repairs", code: "1001" }],
    )).toEqual([null]);
  });
});
