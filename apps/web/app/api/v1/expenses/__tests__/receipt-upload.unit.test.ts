import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withRole: (_roles: string[], handler: Function) => (req: NextRequest) => handler(req, mockSession),
}));

const mockWithExpenseContext = vi.fn();
vi.mock("@/lib/expenses/db", () => ({
  withExpenseContext: (...args: unknown[]) => mockWithExpenseContext(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { POST } from "../[id]/receipt/route";

function requestWithForm(form: FormData): NextRequest {
  return new NextRequest("http://localhost/api/v1/expenses/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/receipt", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/v1/expenses/[id]/receipt", () => {
  it("requires a file", async () => {
    const res = await POST(requestWithForm(new FormData()));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.message).toBe("file is required");
  });

  it("rejects non-image files before touching the database", async () => {
    const form = new FormData();
    form.append("file", new File(["hello"], "receipt.txt", { type: "text/plain" }));

    const res = await POST(requestWithForm(form));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.message).toBe("Only image files are allowed");
    expect(mockWithExpenseContext).not.toHaveBeenCalled();
  });
});
