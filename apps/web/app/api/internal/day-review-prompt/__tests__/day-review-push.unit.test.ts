import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const INTERNAL_KEY = "test-internal-key";

const {
  mockQueryOne,
  mockSendPushToOwners,
  mockBusinessToday,
  mockBusinessMinutesNow,
} = vi.hoisted(() => {
  process.env.LOCATION_INTERNAL_KEY = "test-internal-key";
  return {
    mockQueryOne: vi.fn(),
    mockSendPushToOwners: vi.fn(),
    mockBusinessToday: vi.fn(() => "2026-09-05"),
    mockBusinessMinutesNow: vi.fn(() => 20 * 60),
  };
});

vi.mock("@/lib/db", () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}));

vi.mock("@/lib/push/send", () => ({
  sendPushToOwners: (...args: unknown[]) => mockSendPushToOwners(...args),
}));

vi.mock("@/lib/operations/business-day", () => ({
  businessToday: () => mockBusinessToday(),
  businessMinutesNow: () => mockBusinessMinutesNow(),
}));

import { POST } from "../route";

const ACCOUNT_ID = "acct-owner-1";
const BUSINESS_DAY_ID = "bd-1";
const DAY_REVIEW_PUSH = {
  title: "Time to close out your day",
  body: "You're home — review today's visits and close the day.",
  url: "/app/day-review",
  tag: "day-review-2026-09-05",
};

function post(apiKey?: string): NextRequest {
  const headers = new Headers();
  if (apiKey) headers.set("x-api-key", apiKey);
  return new NextRequest("http://localhost/api/internal/day-review-prompt", {
    method: "POST",
    headers,
  });
}

function openDayRow(overrides: Record<string, unknown> = {}) {
  return {
    account_id: ACCOUNT_ID,
    business_day_id: BUSINESS_DAY_ID,
    cutoff_time: "18:00:00",
    already_prompted: false,
    ...overrides,
  };
}

describe("POST /api/internal/day-review-prompt Web Push (TASK-116)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBusinessToday.mockReturnValue("2026-09-05");
    mockBusinessMinutesNow.mockReturnValue(20 * 60);
    mockSendPushToOwners.mockResolvedValue(1);
    mockQueryOne.mockResolvedValue(openDayRow());
  });

  it("returns 401 and does not send when the api key is missing", async () => {
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockSendPushToOwners).not.toHaveBeenCalled();
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it("returns 401 and does not send when the api key is wrong", async () => {
    const res = await POST(post("wrong-key"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockSendPushToOwners).not.toHaveBeenCalled();
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it("sends once with the day-review payload on the prompted path", async () => {
    const res = await POST(post(INTERNAL_KEY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "prompted" });
    expect(mockSendPushToOwners).toHaveBeenCalledTimes(1);
    expect(mockSendPushToOwners).toHaveBeenCalledWith(ACCOUNT_ID, DAY_REVIEW_PUSH);
    expect(mockSendPushToOwners.mock.calls[0][1].url).toBe("/app/day-review");
  });

  it("does not send when there is no open day", async () => {
    mockQueryOne.mockResolvedValueOnce(openDayRow({ business_day_id: null }));
    const res = await POST(post(INTERNAL_KEY));
    expect(await res.json()).toEqual({ result: "skipped", reason: "no_open_day" });
    expect(mockSendPushToOwners).not.toHaveBeenCalled();
  });

  it("does not send when already prompted", async () => {
    mockQueryOne.mockResolvedValueOnce(openDayRow({ already_prompted: true }));
    const res = await POST(post(INTERNAL_KEY));
    expect(await res.json()).toEqual({ result: "skipped", reason: "already_prompted" });
    expect(mockSendPushToOwners).not.toHaveBeenCalled();
  });

  it("does not send before cutoff", async () => {
    mockBusinessMinutesNow.mockReturnValue(17 * 60);
    const res = await POST(post(INTERNAL_KEY));
    expect(await res.json()).toEqual({ result: "skipped", reason: "before_cutoff" });
    expect(mockSendPushToOwners).not.toHaveBeenCalled();
  });
});
