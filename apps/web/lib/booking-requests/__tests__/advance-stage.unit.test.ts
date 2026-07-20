/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { advanceBookingRequestStage } from "../advance-stage";

const mockQuery = vi.fn();
const mockClient = { query: mockQuery } as never;

vi.mock("@/lib/status-history", () => ({
  recordStatusChange: vi.fn().mockResolvedValue(undefined),
}));

import { recordStatusChange } from "@/lib/status-history";

describe("advanceBookingRequestStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("advances pending → assessment_booked", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "br-1", status: "pending" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await advanceBookingRequestStage(mockClient, {
      accountId: "acc-1",
      requestId: "br-1",
      target: "assessment_booked",
      actorId: "user-1",
      visitId: "vis-1",
    });

    expect(result.advanced).toBe(true);
    expect(result.from).toBe("pending");
    expect(result.to).toBe("assessment_booked");
    expect(mockQuery.mock.calls[1][0]).toContain("status = $");
    expect(recordStatusChange).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        fromStatus: "pending",
        toStatus: "assessment_booked",
      })
    );
  });

  it("does not regress estimated → assessment_booked", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "br-1", status: "estimated" }] });

    const result = await advanceBookingRequestStage(mockClient, {
      accountId: "acc-1",
      requestId: "br-1",
      target: "assessment_booked",
    });

    expect(result.advanced).toBe(false);
    expect(result.to).toBe("estimated");
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("does not advance terminal converted", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "br-1", status: "converted" }] });

    const result = await advanceBookingRequestStage(mockClient, {
      accountId: "acc-1",
      requestId: "br-1",
      target: "lost",
      closedReason: "stale",
    });

    expect(result.advanced).toBe(false);
    expect(result.to).toBe("converted");
  });

  it("marks lost with closed_reason", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "br-1", status: "estimated" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await advanceBookingRequestStage(mockClient, {
      accountId: "acc-1",
      requestId: "br-1",
      target: "lost",
      closedReason: "estimate_declined",
      actorId: "user-1",
    });

    expect(result.advanced).toBe(true);
    expect(result.to).toBe("lost");
    const updateSql = String(mockQuery.mock.calls[1][0]);
    expect(updateSql).toContain("closed_at");
    expect(updateSql).toContain("closed_reason");
    expect(mockQuery.mock.calls[1][1]).toContain("estimate_declined");
  });

  it("returns no-op when request missing", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await advanceBookingRequestStage(mockClient, {
      accountId: "acc-1",
      requestId: "missing",
      target: "estimated",
    });

    expect(result.advanced).toBe(false);
    expect(result.from).toBeNull();
  });
});
