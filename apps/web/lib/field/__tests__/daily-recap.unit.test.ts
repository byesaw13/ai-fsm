import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  // APIError referenced in the auth-failure branch (not exercised here).
  (MockAnthropic as unknown as { APIError: unknown }).APIError = class extends Error {};
  return { default: MockAnthropic };
});

import { interpretDailyRecap, DailyRecapError, type RecapCandidateTask } from "../daily-recap";

const TASKS: RecapCandidateTask[] = [
  { id: "t-faucet", label: "Replace faucet", work_order_title: "Master bath" },
  { id: "t-wall", label: "Paint accent wall", work_order_title: "Living room" },
  { id: "t-lights", label: "Replace 3 bathroom lights", work_order_title: "Bathrooms" },
  { id: "t-ptrap", label: "Replace p-trap", work_order_title: "Kitchen" },
];

const NARRATION = `8-hour day. I got 3 done: faucet took about 2 hours, replaced all three lights in an hour.
The accent wall had issues — the paint was the wrong color, I had to go get replacement paint which took the rest of the day. P-trap not done.`;

// What a well-behaved model returns for the example above.
const MODEL_OUTPUT = {
  task_time: [
    { task_id: "t-faucet", label: "Replace faucet", minutes: 120, status: "done", note: "" },
    { task_id: "t-lights", label: "Replace 3 bathroom lights", minutes: 60, status: "done", note: "" },
    { task_id: "t-wall", label: "Paint accent wall", minutes: 180, status: "blocked", note: "Paint was the wrong color" },
  ],
  other_time: [{ activity_type: "material_run", minutes: 120, note: "Trip for replacement paint" }],
  summary: "Faucet and lights done; accent wall blocked on wrong paint; p-trap untouched.",
  reconciliation_note: "Attributed ~8h matches the clocked 8h day.",
};

function mockToolResponse(input: unknown, stop_reason = "tool_use") {
  mockCreate.mockResolvedValue({
    stop_reason,
    content: [{ type: "tool_use", name: "record_daily_recap", input }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("interpretDailyRecap", () => {
  it("turns the recap into per-task time, statuses, and non-task buckets", async () => {
    mockToolResponse(MODEL_OUTPUT);
    const draft = await interpretDailyRecap({
      narration: NARRATION,
      candidateTasks: TASKS,
      clockedMinutes: 480,
      date: "2026-07-20",
    });

    const faucet = draft.task_time.find((t) => t.task_id === "t-faucet");
    const lights = draft.task_time.find((t) => t.task_id === "t-lights");
    const wall = draft.task_time.find((t) => t.task_id === "t-wall");
    expect(faucet).toMatchObject({ minutes: 120, status: "done" });
    expect(lights).toMatchObject({ minutes: 60, status: "done" });
    expect(wall).toMatchObject({ minutes: 180, status: "blocked" });
    // p-trap was untouched → no entry
    expect(draft.task_time.some((t) => t.task_id === "t-ptrap")).toBe(false);
    // material run captured as non-task time
    expect(draft.other_time).toEqual([{ activity_type: "material_run", minutes: 120, note: "Trip for replacement paint" }]);
    // total = 120+60+180 + 120 = 480 (the clocked day)
    expect(draft.totalMinutes).toBe(480);
  });

  it("passes the candidate task ids and clocked length to the model", async () => {
    mockToolResponse(MODEL_OUTPUT);
    await interpretDailyRecap({ narration: NARRATION, candidateTasks: TASKS, clockedMinutes: 480, date: "2026-07-20" });
    const msg = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(msg).toContain("id=t-faucet");
    expect(msg).toContain("480 minutes");
  });

  it("throws AI_NOT_CONFIGURED when the key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      interpretDailyRecap({ narration: NARRATION, candidateTasks: TASKS, clockedMinutes: 480, date: "2026-07-20" }),
    ).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a truncated response", async () => {
    mockToolResponse(MODEL_OUTPUT, "max_tokens");
    await expect(
      interpretDailyRecap({ narration: NARRATION, candidateTasks: TASKS, clockedMinutes: 480, date: "2026-07-20" }),
    ).rejects.toBeInstanceOf(DailyRecapError);
  });
});
