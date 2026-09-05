import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { stampLivePromptedAt } from "../stamp-live-prompted";

describe("stampLivePromptedAt (TASK-116)", () => {
  it("stamps live_prompted_at with COALESCE for a pending candidate", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;

    await stampLivePromptedAt(client, "cand-1", "acct-1");

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE visit_candidates/i);
    expect(sql).toMatch(/live_prompted_at = COALESCE\(live_prompted_at, now\(\)\)/);
    expect(sql).toMatch(/status = 'pending'/);
    expect(params).toEqual(["cand-1", "acct-1"]);
  });
});
