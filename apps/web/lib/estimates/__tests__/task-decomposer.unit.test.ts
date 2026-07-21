import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  (MockAnthropic as unknown as { APIError: unknown }).APIError = class extends Error {};
  return { default: MockAnthropic };
});

import { decomposeIntoTasks, TaskDecompositionError } from "../task-decomposer";

const OUTPUT = {
  work_orders: [
    { title: "Master bath", scope: "Faucet + p-trap", tasks: [
      { label: "Replace faucet", required: true },
      { label: "Replace p-trap", required: true },
    ] },
    { title: "Living room", scope: "Accent wall", tasks: [
      { label: "Paint accent wall", required: false },
    ] },
  ],
};

function mockTool(input: unknown, stop = "tool_use") {
  mockCreate.mockResolvedValue({ stop_reason: stop, content: [{ type: "tool_use", name: "propose_work_breakdown", input }] });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("decomposeIntoTasks", () => {
  it("returns work orders each with a discrete task checklist", async () => {
    mockTool(OUTPUT);
    const res = await decomposeIntoTasks({
      scope: "Bath + living room refresh",
      rooms: [{ name: "Master bath", notes: "faucet + p-trap" }, { name: "Living room" }],
      laborLines: ["Plumbing", "Painting"],
    });
    expect(res.work_orders).toHaveLength(2);
    expect(res.work_orders[0].tasks.map((t) => t.label)).toEqual(["Replace faucet", "Replace p-trap"]);
    expect(res.work_orders[1].tasks[0]).toMatchObject({ label: "Paint accent wall", required: false });
  });

  it("passes the scope, rooms, and labor lines to the model", async () => {
    mockTool(OUTPUT);
    await decomposeIntoTasks({ scope: "Kitchen reno", rooms: [{ name: "Kitchen" }], laborLines: ["Cabinet install"] });
    const msg = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(msg).toContain("Kitchen reno");
    expect(msg).toContain("- Kitchen");
    expect(msg).toContain("Cabinet install");
  });

  it("throws AI_NOT_CONFIGURED without the key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      decomposeIntoTasks({ scope: "x", rooms: [], laborLines: [] }),
    ).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a malformed payload", async () => {
    mockTool({ work_orders: [{ title: "x" }] }); // missing tasks
    await expect(decomposeIntoTasks({ scope: "x", rooms: [], laborLines: [] })).rejects.toBeInstanceOf(TaskDecompositionError);
  });
});
