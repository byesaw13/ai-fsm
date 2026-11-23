import { expect, type Page } from "@playwright/test";

/**
 * A draft cannot be sent until its hours and direct costs are complete (TASK-194).
 * Fills any missing line hours (1–2 h) and line costs (cost = price) through the API,
 * then confirms other direct costs at $0 in the baseline panel, the way the owner would.
 */
export async function makeEstimateSendable(page: Page, estimateId: string): Promise<void> {
  const status = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/estimates/${id}`);
    const { data } = (await res.json()) as {
      data: {
        updated_at: string;
        labor_hours_low: string | null;
        labor_hours_high: string | null;
        line_items: Array<Record<string, unknown>>;
      };
    };
    const lines = data.line_items;
    const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
    let changed = false;
    const fixed = lines.map((line, i) => {
      const type = String(line.line_item_type ?? "labor");
      let hoursLow = n(line.hours_low);
      let hoursHigh = n(line.hours_high);
      let cost = n(line.unit_cost_cents);
      if (type === "labor" && (hoursLow == null || hoursHigh == null || hoursHigh <= 0)) {
        hoursLow = 1;
        hoursHigh = 2;
        changed = true;
      }
      if ((type === "materials" || type === "equipment") && cost == null) {
        cost = Number(line.unit_price_cents);
        changed = true;
      }
      return {
        description: line.description,
        quantity: Number(line.quantity),
        unit_price_cents: Number(line.unit_price_cents),
        ...(cost != null ? { unit_cost_cents: cost } : {}),
        line_item_type: type,
        visible_to_customer: line.visible_to_customer !== false,
        adjustment_type: line.adjustment_type ?? null,
        sort_order: i,
        hours_low: hoursLow,
        hours_high: hoursHigh,
        hours_source: hoursLow == null ? null : (line.hours_source ?? "owner"),
      };
    });
    const flatNeedsHours = lines.every((l) => l.line_item_type !== "labor")
      && (n(data.labor_hours_low) == null || n(data.labor_hours_high) == null);
    if (!changed && !flatNeedsHours) return 200;
    const patch = await fetch(`/api/v1/estimates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updated_at: data.updated_at,
        ...(changed ? { line_items: fixed } : {}),
        ...(flatNeedsHours ? { labor_hours_low: 1, labor_hours_high: 2, labor_hours_source: "owner" } : {}),
      }),
    });
    return patch.status;
  }, estimateId);
  expect(status).toBe(200);

  await page.reload();
  const main = page.locator("#main-content");
  const panel = main.getByTestId("baseline-panel");
  await panel.getByTestId("baseline-other-direct").fill("0");
  await panel.getByTestId("baseline-confirm-costs").click();
  await expect(panel.getByTestId("baseline-costs-confirmed")).toBeVisible();
  await expect(main.getByTestId("before-send-checklist")).toHaveCount(0);
}

export function estimateIdFromUrl(url: string): string {
  const match = url.match(/\/app\/estimates\/([0-9a-f-]{36})/);
  if (!match) throw new Error(`No estimate id in ${url}`);
  return match[1];
}
