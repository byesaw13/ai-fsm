import { describe, expect, it } from "vitest";
import { STALE_QUOTE_MESSAGE, assertQuoteVersion, quoteUpdatedAt, quoteVersionsMatch } from "../quote-version";

const CURRENT = "2026-10-29T18:01:02.123Z";

describe("quote version check (TASK-222)", () => {
  it("accepts the timestamp the page loaded", () => {
    const stored = new Date(CURRENT);
    expect(quoteVersionsMatch(stored, CURRENT)).toBe(true);
    expect(quoteVersionsMatch(stored, quoteUpdatedAt(stored))).toBe(true);
    expect(() => assertQuoteVersion(stored, CURRENT)).not.toThrow();
  });

  it("rejects a stale timestamp and leaves the message for the owner", () => {
    const stored = new Date(CURRENT);
    const loaded = "2026-10-29T18:00:00.000Z";
    expect(quoteVersionsMatch(stored, loaded)).toBe(false);
    expect(() => assertQuoteVersion(stored, loaded)).toThrow(STALE_QUOTE_MESSAGE);
  });

  it("treats a missing or unreadable timestamp as not the current quote", () => {
    expect(quoteVersionsMatch(new Date(CURRENT), "")).toBe(false);
    expect(quoteVersionsMatch(new Date(CURRENT), "yesterday")).toBe(false);
    expect(quoteVersionsMatch(null, CURRENT)).toBe(false);
  });
});
