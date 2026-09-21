import { describe, expect, it } from "vitest";
import {
  commercialPricingForQuote,
  splitQuotePricingQuery,
} from "../commercial-pricing";

describe("splitQuotePricingQuery", () => {
  it("treats hourly_internal as T&M, not a form layout", () => {
    expect(splitQuotePricingQuery("hourly_internal")).toEqual({
      commercial: "hourly_internal",
    });
  });

  it("treats itemized / multi_option as layout only", () => {
    expect(splitQuotePricingQuery("itemized")).toEqual({ presentation: "itemized" });
    expect(splitQuotePricingQuery("multi_option")).toEqual({ presentation: "multi_option" });
  });

  it("flat_rate is a bid quote and a one-price form", () => {
    expect(splitQuotePricingQuery("flat_rate")).toEqual({
      commercial: "flat_rate",
      presentation: "flat_rate",
    });
  });
});

describe("commercialPricingForQuote", () => {
  it("stores a bid as flat_rate", () => {
    expect(commercialPricingForQuote({ entryMode: "quick" })).toBe("flat_rate");
    expect(commercialPricingForQuote({ entryMode: "detailed" })).toBe("flat_rate");
    expect(commercialPricingForQuote({ explicit: "flat_rate" })).toBe("flat_rate");
  });

  it("stores T&M as hourly_internal", () => {
    expect(commercialPricingForQuote({ entryMode: "tm" })).toBe("hourly_internal");
    expect(commercialPricingForQuote({ hasTmDraft: true })).toBe("hourly_internal");
    expect(commercialPricingForQuote({ explicit: "hourly_internal" })).toBe("hourly_internal");
  });

  it("an explicit commercial value wins over entry mode", () => {
    expect(commercialPricingForQuote({ explicit: "flat_rate", entryMode: "tm" })).toBe("flat_rate");
  });
});
