import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  return { default: MockAnthropic };
});

import {
  priceForSuggestion,
  suggestLineItems,
  type PriceBookEntry,
} from "../item-suggester";

function entry(over: Partial<PriceBookEntry> = {}): PriceBookEntry {
  return {
    id: "pb-1",
    code: "1001",
    name: "Faucet repair",
    category: "plumbing",
    price_min_cents: 10000,
    price_max_cents: 20000,
    default_price_cents: null,
    add_on_price_cents: null,
    unit_type: "each",
    description: null,
    default_labor_hours: null,
    requires_materials: false,
    upsell_codes: [],
    labor_hours_typical: null,
    scope_description: null,
    excluded_items: null,
    legal_status_ma: "legal",
    legal_status_nh: "legal",
    quote_trigger: false,
    ...over,
  };
}

describe("priceForSuggestion", () => {
  it("uses the price book default when one is set", () => {
    expect(priceForSuggestion({ default_price_cents: 25000, price_min_cents: 10000 })).toEqual({
      cents: 25000,
      source: "default",
    });
  });

  it("uses the minimum when there is no default", () => {
    expect(priceForSuggestion({ default_price_cents: null, price_min_cents: 10000 })).toEqual({
      cents: 10000,
      source: "minimum",
    });
  });

  it("has no price when the book has neither", () => {
    expect(priceForSuggestion({ default_price_cents: null, price_min_cents: null })).toEqual({
      cents: null,
      source: "none",
    });
  });
});

describe("suggestLineItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("ignores a price in the model response", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: {
            items: [
              {
                code: "1001",
                quantity: 1,
                unit_price_cents: 999999,
                reason: "Matches the faucet.",
              },
            ],
          },
        },
      ],
    });

    const suggestions = await suggestLineItems("Fix the faucet", [
      entry({ default_price_cents: null, price_min_cents: 10000 }),
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].unit_price_cents).toBe(10000);
    expect(suggestions[0].price_source).toBe("minimum");

    const tool = mockCreate.mock.calls[0][0].tools[0];
    const itemSchema = tool.input_schema.properties.items.items;
    expect(itemSchema.properties.unit_price_cents).toBeUndefined();
    expect(itemSchema.required).not.toContain("unit_price_cents");
  });
});
