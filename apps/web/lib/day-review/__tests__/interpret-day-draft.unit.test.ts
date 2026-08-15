import { describe, it, expect } from "vitest";
import { narrateDayDraft } from "../interpret-day-draft";
import type { DayDraft } from "@ai-fsm/domain";

const empty: DayDraft = {
  items: [],
  readyCount: 0,
  exceptionCount: 0,
  alreadyLoggedCount: 0,
  attributedMinutes: 0,
  clockedMinutes: null,
  reconciliation: "Nothing ready to accept · no exceptions · attributed 0m.",
};

describe("narrateDayDraft", () => {
  it("returns null when Anthropic is not configured", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(narrateDayDraft(empty, "2026-08-11")).resolves.toBeNull();
    } finally {
      if (prev != null) process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});
