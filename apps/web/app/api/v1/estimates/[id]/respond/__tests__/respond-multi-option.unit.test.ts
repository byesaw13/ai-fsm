/**
 * Email approval link and Good/Better/Best estimates (TASK-181): the link never
 * approves a multi-option estimate; it sends the customer to the portal to pick.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: async () => ({ query: mockQuery, release: vi.fn() }) }),
}));
vi.mock("jose", () => ({
  jwtVerify: vi.fn(async () => ({ payload: { estimateId: "e1", action: "approve" } })),
}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "x".repeat(32) }) }));
vi.mock("@/lib/workflow-events", () => ({ writeWorkflowEvent: vi.fn() }));
vi.mock("@/lib/estimates/create-job-db", () => ({ createJobFromEstimate: vi.fn(), getAccountOwnerUserId: vi.fn() }));
vi.mock("@/lib/estimates/approve", () => ({ createApprovalArtifacts: vi.fn() }));
vi.mock("@/lib/booking-requests/advance-stage", () => ({ advanceBookingRequestForEstimate: vi.fn() }));

import { POST } from "../route";

const post = () =>
  new NextRequest("http://localhost:3000/api/v1/estimates/e1/respond", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "action=approve&token=t",
  });

beforeEach(() => {
  mockQuery.mockReset();
  process.env.APP_URL = "https://app.example.com";
});

describe("email approval of a multi-option estimate", () => {
  it("redirects to the portal and does not approve", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ presentation_mode: "multi_option", share_token: "tok123" }] });
    const res = await POST(post());
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/portal/estimates/tok123");
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes("SET status"))).toBe(false);
    expect(mockQuery.mock.calls.some((c) => c[0] === "ROLLBACK")).toBe(true);
  });

  it("still approves a standard estimate", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ presentation_mode: "standard", share_token: "tok" }] })
      .mockResolvedValue({ rows: [] }); // UPDATE returns no row → treated as already responded
    const res = await POST(post());
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes("SET status"))).toBe(true);
    expect(res.headers.get("location")).toContain("/estimate/thanks");
  });
});
