import { describe, expect, it, vi } from "vitest";
import { pruneAttentionEvents } from "./prune-attention-events.js";

describe("pruneAttentionEvents", () => {
  it("deletes rows older than 90 days", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 3 });
    const client = { query } as never;
    const result = await pruneAttentionEvents(client);
    expect(result).toEqual({ deleted: 3, errors: 0 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM attention_events"),
      ["90"],
    );
  });

  it("returns errors: 1 on failure without throwing", async () => {
    const query = vi.fn().mockRejectedValue(new Error("db down"));
    const client = { query } as never;
    const result = await pruneAttentionEvents(client);
    expect(result).toEqual({ deleted: 0, errors: 1 });
  });
});
