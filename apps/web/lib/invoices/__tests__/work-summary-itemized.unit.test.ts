import { describe, it, expect } from "vitest";
import { buildWorkSummaryFromTasks } from "../work-summary";
import { buildItemizedReceipts } from "../itemized-receipts";

describe("buildWorkSummaryFromTasks", () => {
  const t = (label: string, status = "done", parent_task_id: string | null = null) => ({
    label,
    status,
    parent_task_id,
  });

  it("groups done tasks by area in first-seen order", () => {
    const out = buildWorkSummaryFromTasks([
      t("Kitchen — repair ceiling imperfections"),
      t("Main bath — install new faucet"),
      t("Kitchen — prime and repaint ceiling"),
    ]);
    expect(out).toBe(
      "Kitchen\n• Repair ceiling imperfections\n• Prime and repaint ceiling\n\nMain bath\n• Install new faucet",
    );
  });

  it("skips open tasks and child remainder tasks", () => {
    const out = buildWorkSummaryFromTasks([
      t("Back deck — pressure wash deck"),
      t("all of it", "done", "parent-1"),
      t("Back deck — seal penetrations", "open"),
    ]);
    expect(out).toBe("Back deck\n• Pressure wash deck");
  });

  it("puts labels without an area under General and dedupes", () => {
    const out = buildWorkSummaryFromTasks([t("haul debris"), t("haul debris")]);
    expect(out).toBe("General\n• Haul debris");
  });

  it("returns empty string when nothing is done", () => {
    expect(buildWorkSummaryFromTasks([t("Kitchen — paint", "open")])).toBe("");
  });
});

describe("buildItemizedReceipts", () => {
  const r = (id: string, amount_cents: number) => ({
    id,
    expense_date: "2026-09-01",
    vendor_name: "Home Depot",
    amount_cents,
  });
  const item = (expense_id: string, name: string, quantity: number, unit: number, billable = true) => ({
    expense_id,
    name,
    quantity,
    unit_cost_cents: unit,
    billable,
  });

  it("sums billable items and excludes non-billable ones", () => {
    const res = buildItemizedReceipts(
      [r("a", 5000)],
      [item("a", "Lumber", 2, 1500), item("a", "Drink", 1, 300, false)],
    );
    expect(res.receipts[0].items.map((i) => i.name)).toEqual(["Lumber"]);
    expect(res.total_cents).toBe(3000);
  });

  it("bills an unitemized receipt at its total", () => {
    const res = buildItemizedReceipts([r("b", 41358)], []);
    expect(res.receipts[0]).toMatchObject({ itemized: false, total_cents: 41358 });
    expect(res.total_cents).toBe(41358);
  });

  it("drops a receipt whose items are all excluded", () => {
    const res = buildItemizedReceipts([r("c", 5000), r("d", 700)], [item("c", "Bins", 1, 5000, false)]);
    expect(res.receipts.map((x) => x.id)).toEqual(["d"]);
    expect(res.total_cents).toBe(700);
  });

  it("rounds fractional quantities per line", () => {
    const res = buildItemizedReceipts([r("e", 0)], [item("e", "Trim", 1.5, 333)]);
    expect(res.receipts[0].items[0].total_cents).toBe(500);
  });
});
