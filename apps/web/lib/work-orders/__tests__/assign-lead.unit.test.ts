import { describe, it, expect, vi } from "vitest";
import { syncWorkOrderLeadFromVisit } from "../assign-lead";

describe("syncWorkOrderLeadFromVisit", () => {
  it("no-ops without assignee", async () => {
    const query = vi.fn();
    await syncWorkOrderLeadFromVisit({ query } as never, "wo-1", "acct", null);
    expect(query).not.toHaveBeenCalled();
  });

  it("updates work order lead", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await syncWorkOrderLeadFromVisit({ query } as never, "wo-1", "acct", "user-1");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("assigned_user_id"),
      ["wo-1", "acct", "user-1"],
    );
  });
});