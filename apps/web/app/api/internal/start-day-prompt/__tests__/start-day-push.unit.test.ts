import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// KEY is captured at module load — hoist so it is set before importing POST.
vi.hoisted(() => {
  process.env.LOCATION_INTERNAL_KEY = "test-key";
});

const mockQueryOne = vi.fn();
vi.mock("@/lib/db", () => ({
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

const mockSendPushToOwners = vi.fn();
vi.mock("@/lib/push/send", () => ({
  sendPushToOwners: (...a: unknown[]) => mockSendPushToOwners(...a),
}));

vi.mock("@/lib/operations/business-day", () => ({
  businessToday: () => "2026-09-05",
}));

import { POST } from "../route";

const ACCOUNT = "00000000-0000-0000-0000-0000000000aa";

function req(key: string | null = "test-key"): NextRequest {
  const headers: Record<string, string> = {};
  if (key) headers["x-api-key"] = key;
  return new NextRequest("https://app/api/internal/start-day-prompt", {
    method: "POST",
    headers,
  });
}

function startEligible(over: Partial<{
  account_id: string;
  suppress_weekend_start_prompt: boolean;
  has_open_mileage_today: boolean;
}> = {}) {
  return {
    account_id: ACCOUNT,
    suppress_weekend_start_prompt: false,
    has_open_mileage_today: false,
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockSendPushToOwners.mockResolvedValue(0);
});

describe("POST /api/internal/start-day-prompt — auth", () => {
  it("401 without key and does not send push", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockSendPushToOwners).not.toHaveBeenCalled();
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it("401 with wrong key and does not send push", async () => {
    const res = await POST(req("wrong-key"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockSendPushToOwners).not.toHaveBeenCalled();
    expect(mockQueryOne).not.toHaveBeenCalled();
  });
});

describe("POST /api/internal/start-day-prompt — start push", () => {
  it("returns start and sends Web Push once with the start-day payload", async () => {
    mockQueryOne.mockResolvedValue(startEligible());

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signal: "start" });
    expect(mockSendPushToOwners).toHaveBeenCalledOnce();
    expect(mockSendPushToOwners).toHaveBeenCalledWith(ACCOUNT, {
      title: "Start your day?",
      body: "RAM connected — tap to open My Work.",
      url: "/app/my-work",
      tag: "start-day-2026-09-05",
    });
  });

  it("still returns start when sendPushToOwners delivers 0", async () => {
    mockQueryOne.mockResolvedValue(startEligible());
    mockSendPushToOwners.mockResolvedValue(0);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signal: "start" });
  });
});

describe("POST /api/internal/start-day-prompt — no send", () => {
  it("already_started does not send push", async () => {
    mockQueryOne.mockResolvedValue(startEligible({ has_open_mileage_today: true }));

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signal: "already_started" });
    expect(mockSendPushToOwners).not.toHaveBeenCalled();
  });

  it("suppress_weekend does not send push", async () => {
    mockQueryOne.mockResolvedValue(startEligible({ suppress_weekend_start_prompt: true }));

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signal: "suppress_weekend" });
    expect(mockSendPushToOwners).not.toHaveBeenCalled();
  });

  it("no owner row returns no_action and does not send push", async () => {
    mockQueryOne.mockResolvedValue(null);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signal: "no_action" });
    expect(mockSendPushToOwners).not.toHaveBeenCalled();
  });
});
