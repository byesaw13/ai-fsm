import { describe, expect, it, vi } from "vitest";
import { recordStatusChange } from "../status-history";

describe("recordStatusChange", () => {
  it("inserts a status history row with the expected parameters", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await recordStatusChange(client as never, {
      accountId: "00000000-0000-0000-0000-000000000001",
      entityType: "booking_request",
      entityId: "00000000-0000-0000-0000-000000000002",
      fromStatus: "pending",
      toStatus: "reviewed",
      changedBy: "00000000-0000-0000-0000-000000000003",
      note: "Reviewed by owner",
    });

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO status_history"),
      [
        "00000000-0000-0000-0000-000000000001",
        "booking_request",
        "00000000-0000-0000-0000-000000000002",
        "pending",
        "reviewed",
        "00000000-0000-0000-0000-000000000003",
        "Reviewed by owner",
      ]
    );
  });
});
