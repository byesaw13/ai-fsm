import { describe, expect, it } from "vitest";
import { quoteSaveOffersReload } from "../components/QuoteVersion";

describe("quoteSaveOffersReload", () => {
  it("offers a reload when the quote moved under this page", () => {
    expect(
      quoteSaveOffersReload(
        "This quote changed since you opened it. Reload to see the latest before saving.",
      ),
    ).toBe(true);
  });

  it("leaves other save errors as text only", () => {
    expect(quoteSaveOffersReload("Failed to update estimate.")).toBe(false);
    expect(quoteSaveOffersReload("")).toBe(false);
  });
});
