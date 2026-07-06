import { describe, it, expect, vi } from "vitest";
import { pruneLocationEvents } from "./prune-location-events.js";

describe("pruneLocationEvents", () => {
  it("deletes events older than per-account retention", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 42 });
    const result = await pruneLocationEvents({ query } as never);
    expect(result.deleted).toBe(42);
    expect(String(query.mock.calls[0][0])).toContain("location_retention_days");
  });

  it("returns errors on failure", async () => {
    const query = vi.fn().mockRejectedValue(new Error("db down"));
    const result = await pruneLocationEvents({ query } as never);
    expect(result).toEqual({ deleted: 0, errors: 1 });
  });
});