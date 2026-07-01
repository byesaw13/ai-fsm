import { describe, it, expect, vi } from "vitest";
import { assertAssignedLead } from "../lead-access";

describe("assertAssignedLead", () => {
  it("returns row when lead matches", async () => {
    const row = { id: "wo-1", status: "dispatched", completion_criteria: [] };
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const result = await assertAssignedLead({ query } as never, "wo-1", "acct", "user-1");
    expect(result).toEqual(row);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("assigned_user_id"), ["wo-1", "acct", "user-1"]);
  });
});