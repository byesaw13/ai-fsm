import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.fn();
const mockRecordStatusChange = vi.fn();

vi.mock("@/lib/status-history", () => ({
  recordStatusChange: (...args: unknown[]) => mockRecordStatusChange(...args),
}));

describe("markLinkedBookingRequestConverted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no open booking is linked", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { markLinkedBookingRequestConverted } = await import("../fulfill");
    const client = { query: mockQuery } as never;
    const result = await markLinkedBookingRequestConverted(client, {
      accountId: "a",
      jobId: "j",
      userId: "u",
    });
    expect(result).toBeNull();
    expect(mockRecordStatusChange).not.toHaveBeenCalled();
  });

  it("updates status and records history", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "br-1", status: "reviewed" }] })
      .mockResolvedValueOnce({ rows: [] });
    mockRecordStatusChange.mockResolvedValue(undefined);

    const { markLinkedBookingRequestConverted } = await import("../fulfill");
    const client = { query: mockQuery } as never;
    const result = await markLinkedBookingRequestConverted(client, {
      accountId: "a",
      jobId: "j",
      userId: "u",
      note: "done",
    });
    expect(result).toEqual({ id: "br-1", fromStatus: "reviewed" });
    expect(mockQuery.mock.calls[1][0]).toMatch(/status = 'converted'/);
    expect(mockRecordStatusChange).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        entityId: "br-1",
        fromStatus: "reviewed",
        toStatus: "converted",
      })
    );
  });
});
