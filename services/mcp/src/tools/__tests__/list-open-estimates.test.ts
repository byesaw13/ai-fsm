import { describe, it, expect } from "vitest";
import { run } from "../list-open-estimates.js";
import { makeExec, TEST_SESSION } from "./helpers.js";

describe("list_open_estimates", () => {
  it("lists draft/sent estimates with combined pipeline value", async () => {
    const { exec, calls } = makeExec([
      {
        match: /FROM estimates/,
        rows: [
          { id: "e1", status: "sent", total_cents: 150000, created_at: "2026-06-10", sent_at: "2026-06-11", expires_at: "2026-07-11", client_name: "A" },
          { id: "e2", status: "draft", total_cents: 50000, created_at: "2026-06-09", sent_at: null, expires_at: null, client_name: "B" },
        ],
      },
    ]);

    const result = (await run(exec, TEST_SESSION, {})) as {
      count: number;
      total_value: { cents: number; formatted: string };
    };

    expect(result.count).toBe(2);
    expect(result.total_value.cents).toBe(200000);
    expect(result.total_value.formatted).toBe("$2,000.00");
    expect(calls[0].params).toEqual([TEST_SESSION.accountId, null, 50]);
  });
});
