import { describe, it, expect, vi } from "vitest";
import type { PoolClient } from "pg";
import { recordOptionChoice } from "../option-choice";

type Row = Record<string, unknown>;

function fakeClient(estimate: Row | null, option: Row | null, optionLines: Row[] = []) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM estimates WHERE id")) return { rows: estimate ? [estimate] : [] };
    if (sql.includes("FROM estimate_options")) return { rows: option ? [option] : [] };
    if (sql.includes("FROM estimate_line_items")) return { rows: optionLines };
    return { rows: [] };
  });
  return { client: { query } as unknown as PoolClient, query };
}

const MULTI = { presentation_mode: "multi_option", deposit_required: true, deposit_type: "percentage", deposit_percentage: "30", deposit_fixed_cents: null };
const BETTER = { id: "opt-better", subtotal_cents: 500_000, tax_cents: 0, total_cents: 500_000 };

function updateParams(query: ReturnType<typeof vi.fn>) {
  const call = query.mock.calls.find((c) => String(c[0]).includes("SET selected_option_id"));
  return call?.[1] as unknown[] | undefined;
}

describe("recordOptionChoice", () => {
  it("leaves a standard estimate untouched, whatever is passed", async () => {
    const { client, query } = fakeClient({ ...MULTI, presentation_mode: "standard" }, null);
    expect(await recordOptionChoice(client, "e1", "anything")).toEqual({ multiOption: false, selectedOptionId: null });
    expect(updateParams(query)).toBeUndefined();
  });

  it("refuses to approve a multi-option estimate without a pick", async () => {
    const { client } = fakeClient(MULTI, BETTER);
    await expect(recordOptionChoice(client, "e1", undefined)).rejects.toMatchObject({ code: "OPTION_REQUIRED" });
  });

  it("refuses a pick that belongs to another estimate", async () => {
    const { client } = fakeClient(MULTI, null);
    await expect(recordOptionChoice(client, "e1", "foreign")).rejects.toMatchObject({ code: "OPTION_REQUIRED" });
  });

  it("saves the pick and a percentage deposit from that option", async () => {
    const { client, query } = fakeClient(MULTI, BETTER);
    expect(await recordOptionChoice(client, "e1", "opt-better")).toEqual({ multiOption: true, selectedOptionId: "opt-better" });
    expect(updateParams(query)).toEqual(["opt-better", 150_000, 350_000, "e1"]);
  });

  it("a materials deposit uses only the chosen option's materials lines", async () => {
    const { client, query } = fakeClient({ ...MULTI, deposit_type: "materials", deposit_percentage: null }, BETTER, [
      { total_cents: 80_000, line_item_type: "materials", visible_to_customer: true },
      { total_cents: 420_000, line_item_type: "labor", visible_to_customer: true },
    ]);
    await recordOptionChoice(client, "e1", "opt-better");
    expect(updateParams(query)?.slice(1, 3)).toEqual([80_000, 420_000]);
  });

  it("a fixed deposit stays fixed, capped at the option total", async () => {
    const { client, query } = fakeClient({ ...MULTI, deposit_type: "fixed", deposit_percentage: null, deposit_fixed_cents: 900_000 }, BETTER);
    await recordOptionChoice(client, "e1", "opt-better");
    expect(updateParams(query)?.slice(1, 3)).toEqual([500_000, 0]);
  });
});
