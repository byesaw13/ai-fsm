import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as "owner" | "admin" | "tech",
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withRole: (roles: string[], handler: Function) => async (request: NextRequest) => {
    if (!roles.includes(mockSession.role)) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: `This action requires one of: ${roles.join(", ")}`,
            traceId: mockSession.traceId,
          },
        },
        { status: 403 },
      );
    }
    return handler(request, mockSession);
  },
}));

const fsMocks = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("fs", () => ({
  default: fsMocks,
  ...fsMocks,
}));

const mockQuery = vi.fn();
const mockWithDbSession = vi.fn();

vi.mock("@/lib/db", () => ({
  withDbSession: (...args: unknown[]) => mockWithDbSession(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { POST } from "../route";
import { GET as GET_AUDIO } from "../[id]/audio/route";
import { GET as GET_PHOTO } from "../[id]/photo/route";

const CAPTURE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const AUDIO_NAME = "promise.webm";

function audioFile(name = AUDIO_NAME, type = "audio/webm"): File {
  return new File(["voice-bytes"], name, { type });
}

function postRequest(form: FormData): NextRequest {
  return new NextRequest("http://localhost/api/v1/captures", {
    method: "POST",
    body: form,
  });
}

function getRequest(kind: "audio" | "photo", id = CAPTURE_ID): NextRequest {
  return new NextRequest(`http://localhost/api/v1/captures/${id}/${kind}`, {
    method: "GET",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.role = "owner";
  mockWithDbSession.mockImplementation(async (_session, fn) => fn({ query: mockQuery }));
  mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (String(sql).includes("INSERT INTO capture_evidence")) {
      return { rows: [{ id: params[0] }] };
    }
    return { rows: [] };
  });
  fsMocks.existsSync.mockReturnValue(true);
  fsMocks.readFileSync.mockReturnValue(Buffer.from("voice-bytes"));
});

describe("POST /api/v1/captures", () => {
  it("owner upload succeeds and stores the original under /app/uploads/captures/<id>/", async () => {
    const form = new FormData();
    form.append("audio", audioFile());

    const res = await POST(postRequest(form));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toEqual(expect.any(String));

    const captureId = json.data.id as string;
    const uploadDir = `/app/uploads/captures/${captureId}`;
    expect(fsMocks.mkdirSync).toHaveBeenCalledWith(uploadDir, { recursive: true });

    const writePath = fsMocks.writeFileSync.mock.calls[0]?.[0] as string;
    expect(writePath.startsWith(uploadDir + "/")).toBe(true);
    expect(fsMocks.writeFileSync).toHaveBeenCalledTimes(1);

    expect(mockQuery).toHaveBeenCalled();
    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO capture_evidence"),
    ) as [string, unknown[]];
    expect(insertCall).toBeTruthy();
    const [sql, params] = insertCall;
    expect(sql).toContain("INSERT INTO capture_evidence");
    expect(params[0]).toBe(captureId);
    expect(params[1]).toBe(mockSession.accountId);
    expect(params[2]).toBe(mockSession.userId);
    expect(params[3]).toBe("recorder");
    expect(typeof params[4]).toBe("string");
    expect(writePath).toBe(`${uploadDir}/${params[4]}`);
    expect(params[12]).toBe("pending");
    expect(params[13]).toBeNull();
  });

  it("stores a client transcript so the worker can extract without Whisper", async () => {
    const form = new FormData();
    form.append("audio", audioFile());
    form.append("transcript", "  I told Mrs. Chen I would call tomorrow.  ");

    const res = await POST(postRequest(form));
    expect(res.status).toBe(201);

    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO capture_evidence"),
    ) as [string, unknown[]];
    expect(insertCall[0]).toMatch(/transcript/);
    expect(insertCall[1][13]).toBe("I told Mrs. Chen I would call tomorrow.");
  });

  it("caps an oversized transcript", async () => {
    const form = new FormData();
    form.append("audio", audioFile());
    form.append("transcript", "x".repeat(20_050));

    const res = await POST(postRequest(form));
    expect(res.status).toBe(201);
    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO capture_evidence"),
    ) as [string, unknown[]];
    expect(String(insertCall[1][13])).toHaveLength(20_000);
  });

  it("returns 403 for tech", async () => {
    mockSession.role = "tech";
    const form = new FormData();
    form.append("audio", audioFile());

    const res = await POST(postRequest(form));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
    expect(json.error.traceId).toBe(mockSession.traceId);
    expect(mockWithDbSession).not.toHaveBeenCalled();
    expect(fsMocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("retries with the same client_id return the original capture without a second insert", async () => {
    const clientId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
      if (String(sql).includes("SELECT id FROM capture_evidence")) {
        return { rows: [{ id: params[0] }] };
      }
      return { rows: [] };
    });

    const form = new FormData();
    form.append("client_id", clientId);
    form.append("audio", audioFile());
    const res = await POST(postRequest(form));
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(clientId);
    expect(fsMocks.writeFileSync).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT"))).toBe(false);
  });

  it("returns 422 when audio file is missing", async () => {
    const res = await POST(postRequest(new FormData()));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toMatch(/audio/i);
    expect(json.error.traceId).toBe(mockSession.traceId);
    expect(mockWithDbSession).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/captures/[id]/audio", () => {
  it("serves the stored original without overwriting it", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          audio_filename: "original.webm",
          audio_mime_type: "audio/webm",
          audio_original_name: AUDIO_NAME,
        },
      ],
    });

    const res = await GET_AUDIO(getRequest("audio"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/webm");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("voice-bytes");
    expect(fsMocks.readFileSync).toHaveBeenCalledWith(
      `/app/uploads/captures/${CAPTURE_ID}/original.webm`,
    );
    expect(fsMocks.writeFileSync).not.toHaveBeenCalled();
    expect(fsMocks.unlinkSync).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/captures/[id]/photo", () => {
  it("serves a stored photo original without overwriting it", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          photo_filename: "shot.jpg",
          photo_mime_type: "image/jpeg",
          photo_original_name: "shot.jpg",
        },
      ],
    });
    fsMocks.readFileSync.mockReturnValueOnce(Buffer.from("photo-bytes"));

    const res = await GET_PHOTO(getRequest("photo"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("photo-bytes");
    expect(fsMocks.readFileSync).toHaveBeenCalledWith(
      `/app/uploads/captures/${CAPTURE_ID}/shot.jpg`,
    );
    expect(fsMocks.writeFileSync).not.toHaveBeenCalled();
  });
});
