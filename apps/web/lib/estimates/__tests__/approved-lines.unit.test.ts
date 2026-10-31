import { describe, expect, it } from "vitest";
import { addOnLines, approvedLines, invoiceLinesFor, invoiceMoneyFor, type ConvertSourceLine } from "../approved-lines";

function line(over: Partial<ConvertSourceLine> & Pick<ConvertSourceLine, "id" | "description" | "total_cents">): ConvertSourceLine {
  return {
    option_id: null,
    quantity: 1,
    unit_price_cents: over.total_cents,
    sort_order: 0,
    adjustment_type: null,
    visible_to_customer: true,
    ...over,
  };
}

const estimateBase = {
  risk_adjustment_cents: 0,
  travel_surcharge_cents: 0,
  travel_snapshot_id: null as string | null,
};

describe("approvedLines", () => {
  it("keeps shared lines and only the selected option", () => {
    const lines = [
      line({ id: "shared", description: "Trip fee", total_cents: 5_000 }),
      line({ id: "good", description: "Paint walls", total_cents: 200_000, option_id: "good" }),
      line({ id: "better", description: "Paint walls and trim", total_cents: 420_000, option_id: "better" }),
      line({ id: "best", description: "Full repaint", total_cents: 800_000, option_id: "best" }),
    ];
    expect(approvedLines(lines, "better").map((row) => row.id)).toEqual(["shared", "better"]);
  });

  it("copies a materials cost onto the invoice line", () => {
    const drafted = invoiceLinesFor(estimateBase, [
      line({ id: "paint", description: "Paint", total_cents: 24_000, unit_cost_cents: 20_000 }),
    ]);
    expect(drafted[0]).toMatchObject({ estimate_line_item_id: "paint", unit_cost_cents: 20_000 });
  });

  it("keeps an equipment line as equipment on the invoice", () => {
    const drafted = invoiceLinesFor(estimateBase, [
      line({ id: "lift", description: "Lift rental", total_cents: 12_000, line_item_type: "equipment" }),
    ]);
    expect(drafted[0].line_item_type).toBe("equipment");
  });

  it("keeps only shared lines when nothing is selected", () => {
    const lines = [
      line({ id: "shared", description: "Trip fee", total_cents: 5_000 }),
      line({ id: "good", description: "Paint walls", total_cents: 200_000, option_id: "good" }),
    ];
    expect(approvedLines(lines, null).map((row) => row.id)).toEqual(["shared"]);
  });
});

describe("invoiceLinesFor", () => {
  it("folds hidden lines into one Included work line and hides their text", () => {
    const lines = [
      line({ id: "door", description: "Paint the door", total_cents: 10_000, sort_order: 0 }),
      line({ id: "primer", description: "Internal primer note", total_cents: 3_000, sort_order: 1, visible_to_customer: false }),
      line({ id: "caulk", description: "Internal caulk note", total_cents: 2_000, sort_order: 2, visible_to_customer: false }),
    ];
    const drafted = invoiceLinesFor(estimateBase, lines);
    expect(drafted.map((row) => row.description)).toEqual(["Paint the door", "Included work"]);
    const included = drafted[1];
    expect(included).toMatchObject({
      estimate_line_item_id: null,
      quantity: 1,
      unit_price_cents: 5_000,
      total_cents: 5_000,
      line_item_type: "adjustment",
    });
    expect(drafted[0].line_item_type).toBe("labor");
    expect(drafted.some((row) => row.description.includes("Internal"))).toBe(false);
    expect(drafted.reduce((sum, row) => sum + row.total_cents, 0)).toBe(15_000);
  });

  it("adds a risk line only when the adjustment is above zero", () => {
    const lines = [line({ id: "hinge", description: "Fix hinge", total_cents: 10_000 })];
    expect(invoiceLinesFor(estimateBase, lines).map((row) => row.description)).toEqual(["Fix hinge"]);
    const withRisk = invoiceLinesFor({ ...estimateBase, risk_adjustment_cents: 4_000 }, lines);
    expect(withRisk.map((row) => row.description)).toEqual(["Fix hinge", "Risk adjustment"]);
    expect(withRisk[1]).toMatchObject({
      estimate_line_item_id: null,
      total_cents: 4_000,
      unit_price_cents: 4_000,
      quantity: 1,
      line_item_type: "adjustment",
    });
  });

  it("adds a travel line only for a surcharge with no snapshot", () => {
    const lines = [line({ id: "hinge", description: "Fix hinge", total_cents: 10_000 })];
    const manual = invoiceLinesFor({ ...estimateBase, travel_surcharge_cents: 2_500 }, lines);
    expect(manual.map((row) => row.description)).toEqual(["Fix hinge", "Travel"]);
    expect(manual[1].description.toLowerCase()).not.toContain("travel and service-area");
    expect(manual[1].total_cents).toBe(2_500);
    expect(manual[1].line_item_type).toBe("adjustment");

    const snapshotted = invoiceLinesFor(
      { ...estimateBase, travel_surcharge_cents: 2_500, travel_snapshot_id: "snap-1" },
      lines,
    );
    expect(snapshotted.map((row) => row.description)).toEqual(["Fix hinge"]);
  });

  it("drops stored travel lines when a snapshot will put them back", () => {
    const lines = [
      line({ id: "hinge", description: "Fix hinge", total_cents: 10_000 }),
      line({
        id: "travel",
        description: "Travel and Service-Area Adjustment\n<!--travel-charge-->",
        total_cents: 2_500,
        adjustment_type: "travel_surcharge",
        sort_order: 1,
      }),
    ];
    const drafted = invoiceLinesFor(
      { ...estimateBase, travel_snapshot_id: "snap-1" },
      lines,
    );
    expect(drafted.map((row) => row.description)).toEqual(["Fix hinge"]);
    expect(drafted.reduce((sum, row) => sum + row.total_cents, 0)).toBe(10_000);
  });

  it("does not append risk or travel that the quote form already saved as lines", () => {
    // computeAndPersist writes the form's adjustments as lines and leaves the
    // surcharge fields set. The approved total is labor + risk + travel once.
    const lines = [
      line({ id: "labor", description: "Labor", total_cents: 10_000, sort_order: 0 }),
      line({ id: "risk", description: "Risk adjustment", total_cents: 4_000, sort_order: 1 }),
      line({ id: "travel", description: "Travel surcharge", total_cents: 2_500, sort_order: 2 }),
    ];
    const drafted = invoiceLinesFor(
      { risk_adjustment_cents: 4_000, travel_surcharge_cents: 2_500, travel_snapshot_id: null },
      lines,
    );
    expect(drafted.map((row) => row.description)).toEqual(["Labor", "Risk adjustment", "Travel surcharge"]);
    expect(drafted.reduce((sum, row) => sum + row.total_cents, 0)).toBe(16_500);
  });

  it("keeps a stored travel line when there is no snapshot to replace it", () => {
    const lines = [
      line({ id: "hinge", description: "Fix hinge", total_cents: 10_000 }),
      line({
        id: "travel",
        description: "Travel and Service-Area Adjustment",
        total_cents: 2_500,
        adjustment_type: "travel_surcharge",
        sort_order: 1,
      }),
    ];
    const drafted = invoiceLinesFor(estimateBase, lines);
    expect(drafted.map((row) => row.estimate_line_item_id)).toEqual(["hinge", "travel"]);
    expect(drafted.reduce((sum, row) => sum + row.total_cents, 0)).toBe(12_500);
  });
});

describe("invoiceMoneyFor", () => {
  const stored = { subtotal_cents: 12_500, tax_cents: 0, total_cents: 12_500 };

  it("uses the line sum as the subtotal when those lines already include the adjustments", () => {
    expect(invoiceMoneyFor({
      presentation_mode: "standard",
      subtotal_cents: 10_000,
      tax_cents: 1_031,
      total_cents: 16_500,
      option: null,
      drafted_lines: [{ total_cents: 10_000 }, { total_cents: 4_000 }, { total_cents: 2_500 }],
    })).toEqual({ subtotal_cents: 16_500, tax_cents: 0, total_cents: 16_500 });
  });

  it("keeps the stored subtotal, tax and total on a standard estimate", () => {
    expect(invoiceMoneyFor({
      presentation_mode: "standard",
      ...stored,
      option: null,
      drafted_lines: [{ total_cents: 99_999 }],
      snapshot_travel_cents: 2_500,
    })).toEqual(stored);
  });

  it("prices a multi-option invoice from the chosen lines, not the parent total", () => {
    const better = [{ total_cents: 420_000 }, { total_cents: 80_000 }];
    expect(invoiceMoneyFor({
      presentation_mode: "multi_option",
      subtotal_cents: 0,
      tax_cents: 0,
      total_cents: 0,
      option: { subtotal_cents: 500_000, tax_cents: 0 },
      drafted_lines: better,
    })).toEqual({ subtotal_cents: 500_000, tax_cents: 0, total_cents: 500_000 });
  });

  it("uses the option tax when the drafted lines match the option subtotal", () => {
    expect(invoiceMoneyFor({
      presentation_mode: "multi_option",
      subtotal_cents: 0,
      tax_cents: 0,
      total_cents: 0,
      option: { subtotal_cents: 100_000, tax_cents: 6_250 },
      drafted_lines: [{ total_cents: 100_000 }],
    }).tax_cents).toBe(6_250);
  });

  it("applies the option tax rate to shared, risk and snapshot travel", () => {
    const money = invoiceMoneyFor({
      presentation_mode: "multi_option",
      subtotal_cents: 12_000,
      tax_cents: 750,
      total_cents: 12_750,
      option: { subtotal_cents: 100_000, tax_cents: 6_250 },
      drafted_lines: [{ total_cents: 100_000 }, { total_cents: 10_000 }],
      snapshot_travel_cents: 2_000,
    });
    // 112000 * 6250 / 100000 = 7000
    expect(money).toEqual({ subtotal_cents: 112_000, tax_cents: 7_000, total_cents: 119_000 });
  });
});

describe("add-ons on the final bill (TASK-225)", () => {
  const addOns = [
    { id: "a1", label: "Son's room, whole room", price_cents: 75_000 },
    { id: "a2", label: "Foyer stairwell", price_cents: 105_000 },
  ];

  it("one line per add-on the customer chose, after the drafted lines", () => {
    expect(addOnLines(addOns, [{ sort_order: 0 }, { sort_order: 4 }])).toEqual([
      { estimate_line_item_id: null, description: "Son's room, whole room (added option)", quantity: 1, unit_price_cents: 75_000, total_cents: 75_000, sort_order: 5, unit_cost_cents: null, line_item_type: "labor" },
      { estimate_line_item_id: null, description: "Foyer stairwell (added option)", quantity: 1, unit_price_cents: 105_000, total_cents: 105_000, sort_order: 6, unit_cost_cents: null, line_item_type: "labor" },
    ]);
  });

  it("a standard bill's money is the stored quote plus the add-ons, tax at the quote's rate", () => {
    expect(
      invoiceMoneyFor({
        presentation_mode: "standard",
        subtotal_cents: 875_000,
        tax_cents: 0,
        total_cents: 875_000,
        option: null,
        drafted_lines: [{ total_cents: 875_000 }, { total_cents: 105_000 }],
        add_on_cents: 105_000,
      }),
    ).toEqual({ subtotal_cents: 980_000, tax_cents: 0, total_cents: 980_000 });
    expect(
      invoiceMoneyFor({
        presentation_mode: "standard",
        subtotal_cents: 100_000,
        tax_cents: 5_000,
        total_cents: 105_000,
        option: null,
        drafted_lines: [{ total_cents: 100_000 }, { total_cents: 20_000 }],
        add_on_cents: 20_000,
      }),
    ).toEqual({ subtotal_cents: 120_000, tax_cents: 6_000, total_cents: 126_000 });
  });
});

