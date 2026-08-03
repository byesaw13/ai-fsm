import { describe, expect, it } from "vitest";
import {
  assignAllowanceTags,
  billableLaborCents,
  buildJobLedger,
  classifyEstimateLineBucket,
  parseBudgetHoursFromLine,
  parseCapHoursFromDescription,
  trackedHoursFromMinutes,
} from "./job-ledger";

describe("classifyEstimateLineBucket", () => {
  it("classifies T&M labor, materials allowance, and lift", () => {
    expect(
      classifyEstimateLineBucket({
        description:
          "Labor — T&M estimated budget (90 hours @ $115/hr). Maximum authorized: 110 hours.",
        quantity: 90,
        unit_price_cents: 11500,
        total_cents: 1035000,
        line_item_type: "labor",
      }),
    ).toBe("labor");
    expect(
      classifyEstimateLineBucket({
        description: "Materials allowance — drywall, joint compound, lumber…",
        quantity: 1,
        unit_price_cents: 150000,
        total_cents: 150000,
        line_item_type: "labor",
      }),
    ).toBe("materials");
    expect(
      classifyEstimateLineBucket({
        description: "Lift access allowance — lift rental, delivery, pickup.",
        quantity: 1,
        unit_price_cents: 200000,
        total_cents: 200000,
        line_item_type: "labor",
      }),
    ).toBe("equipment");
  });
});

describe("parse hours / cap", () => {
  it("parses budget hours from quantity and cap from prose", () => {
    const line = {
      description:
        "Labor — T&M (90 hours @ $115/hr). Maximum authorized: 110 hours without prior written owner approval.",
      quantity: 90,
      unit_price_cents: 11500,
      total_cents: 1035000,
      line_item_type: "labor" as const,
    };
    expect(parseBudgetHoursFromLine(line)).toBe(90);
    expect(parseCapHoursFromDescription(line.description)).toBe(110);
  });
});

describe("billable labor", () => {
  it("computes cents from minutes × rate", () => {
    // 95.44 hours ≈ 5726.4 minutes
    const minutes = 95.44 * 60;
    expect(trackedHoursFromMinutes(minutes)).toBe(95.44);
    expect(billableLaborCents(minutes, 11500)).toBe(Math.round(95.44 * 11500));
  });
});

describe("assignAllowanceTags", () => {
  it("FIFO tags receipts against allowance", () => {
    expect(assignAllowanceTags([80000, 70000, 50000], 150000)).toEqual([
      "in_allowance",
      "in_allowance",
      "supply_gap",
    ]);
  });
});

describe("isEquipmentExpense", () => {
  it("tags commercial_tag equipment and lift notes", async () => {
    const { isEquipmentExpense } = await import("./job-ledger");
    expect(isEquipmentExpense({ amount_cents: 1, commercial_tag: "equipment" })).toBe(true);
    expect(
      isEquipmentExpense({ amount_cents: 1, notes: "Boom lift rental for weekend" }),
    ).toBe(true);
    expect(
      isEquipmentExpense({ amount_cents: 1, vendor_name: "Home Depot", notes: "Paint" }),
    ).toBe(false);
  });
});

describe("buildJobLedger — Claremont-shaped T&M", () => {
  it("shows estimate vs actual, deposits, materials overage CO suggestion", () => {
    const ledger = buildJobLedger({
      jobId: "job-1",
      pricingMode: "hourly_internal",
      estimate: {
        id: "est-1",
        number: "EST-2026-0016",
        status: "approved",
        total_cents: 1385000,
        line_items: [
          {
            description:
              "Labor — T&M estimated budget (90 hours @ $115/hr). Maximum authorized: 110 hours without prior written owner approval. Billed on actual hours worked.",
            quantity: 90,
            unit_price_cents: 11500,
            total_cents: 1035000,
            line_item_type: "labor",
          },
          {
            description: "Materials allowance — finishing supplies",
            quantity: 1,
            unit_price_cents: 150000,
            total_cents: 150000,
            line_item_type: "labor",
          },
          {
            description: "Lift access allowance — lift rental",
            quantity: 1,
            unit_price_cents: 200000,
            total_cents: 200000,
            line_item_type: "labor",
          },
        ],
      },
      trackedLaborMinutes: 95.44 * 60,
      materialsExpenses: [{ amount_cents: 340677 }],
      otherExpenses: [{ amount_cents: 175600, notes: "Lift rental" }],
      changeOrders: [],
      paidCents: 150000,
    });

    expect(ledger.estimateNumber).toBe("EST-2026-0016");
    expect(ledger.soldCents).toBe(1385000);
    expect(ledger.canDraftCo).toBe(true);

    const labor = ledger.rows.find((r) => r.bucket === "labor")!;
    expect(labor.estimateHours).toBe(90);
    expect(labor.estimateCapHours).toBe(110);
    expect(labor.actualHours).toBe(95.44);
    expect(labor.actualCents).toBe(Math.round(95.44 * 11500));
    expect(labor.varianceCents).toBe(labor.actualCents - 1035000);

    const materials = ledger.rows.find((r) => r.bucket === "materials")!;
    expect(materials.estimateCents).toBe(150000);
    expect(materials.actualCents).toBe(340677);
    expect(materials.varianceCents).toBe(190677);

    const equip = ledger.rows.find((r) => r.bucket === "equipment")!;
    expect(equip.estimateCents).toBe(200000);
    expect(equip.actualCents).toBe(175600);
    expect(equip.varianceCents).toBe(-24400);

    expect(ledger.paidCents).toBe(150000);
    expect(ledger.actualCents).toBe(
      labor.actualCents + materials.actualCents + equip.actualCents,
    );
    expect(ledger.balanceCents).toBe(ledger.actualCents - 150000);

    expect(ledger.suggestedCoCents).toBeGreaterThan(190000);
    expect(ledger.suggestedCoLines[0].description).toMatch(/Materials over allowance/i);
  });

  it("adds approved COs into sold", () => {
    const ledger = buildJobLedger({
      jobId: "job-1",
      pricingMode: "hourly_internal",
      estimate: {
        id: "est-1",
        number: "EST-1",
        status: "approved",
        total_cents: 100000,
        line_items: [],
      },
      trackedLaborMinutes: 0,
      materialsExpenses: [],
      changeOrders: [
        { id: "co-1", title: "CO-001", status: "approved", total_cents: 50000 },
        { id: "co-2", title: "draft", status: "draft", total_cents: 99999 },
      ],
      paidCents: 0,
    });
    expect(ledger.soldCents).toBe(150000);
  });

  it("does not allow CO draft without approved estimate", () => {
    const ledger = buildJobLedger({
      jobId: "job-1",
      pricingMode: "hourly_internal",
      estimate: {
        id: "est-1",
        number: "EST-1",
        status: "sent",
        total_cents: 150000,
        line_items: [
          {
            description: "Materials allowance",
            quantity: 1,
            unit_price_cents: 10000,
            total_cents: 10000,
          },
        ],
      },
      trackedLaborMinutes: 0,
      materialsExpenses: [{ amount_cents: 50000 }],
      changeOrders: [],
      paidCents: 0,
    });
    expect(ledger.canDraftCo).toBe(false);
    expect(ledger.suggestedCoLines.length).toBeGreaterThan(0);
  });

  it("flat rate hides billable labor actual and balances on sold", () => {
    const ledger = buildJobLedger({
      jobId: "job-1",
      pricingMode: "flat_rate",
      estimate: {
        id: "est-1",
        number: "EST-1",
        status: "approved",
        total_cents: 500000,
        subtotal_cents: 500000,
        line_items: [
          {
            description: "Install cabinets",
            quantity: 1,
            unit_price_cents: 500000,
            total_cents: 500000,
            line_item_type: "labor",
          },
        ],
      },
      trackedLaborMinutes: 10 * 60,
      materialsExpenses: [{ amount_cents: 200000 }],
      changeOrders: [],
      paidCents: 100000,
    });
    const labor = ledger.rows.find((r) => r.bucket === "labor");
    expect(labor?.actualCents).toBe(0);
    // Receipts do not redefine flat-rate balance
    expect(ledger.balanceCents).toBe(500000 - 100000);
  });

  it("suppresses CO draft when open draft exists or approved CO covers variance", () => {
    const withDraft = buildJobLedger({
      jobId: "job-1",
      pricingMode: "hourly_internal",
      estimate: {
        id: "est-1",
        number: "EST-1",
        status: "approved",
        total_cents: 150000,
        line_items: [
          {
            description: "Materials allowance",
            quantity: 1,
            unit_price_cents: 150000,
            total_cents: 150000,
          },
        ],
      },
      trackedLaborMinutes: 0,
      materialsExpenses: [{ amount_cents: 340677 }],
      changeOrders: [
        { id: "co-d", title: "draft", status: "draft", total_cents: 190677, subtotal_cents: 190677 },
      ],
      paidCents: 0,
    });
    expect(withDraft.canDraftCo).toBe(false);

    const covered = buildJobLedger({
      jobId: "job-1",
      pricingMode: "hourly_internal",
      estimate: {
        id: "est-1",
        number: "EST-1",
        status: "approved",
        total_cents: 150000,
        line_items: [
          {
            description: "Materials allowance",
            quantity: 1,
            unit_price_cents: 150000,
            total_cents: 150000,
          },
        ],
      },
      trackedLaborMinutes: 0,
      materialsExpenses: [{ amount_cents: 340677 }],
      changeOrders: [
        { id: "co-a", title: "CO-001", status: "approved", total_cents: 190677, subtotal_cents: 190677 },
      ],
      paidCents: 0,
    });
    expect(covered.suggestedCoCents).toBe(0);
    expect(covered.canDraftCo).toBe(false);
  });
});
