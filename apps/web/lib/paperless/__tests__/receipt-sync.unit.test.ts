/**
 * Unit tests for the receipt → Paperless sync bridge.
 *
 * All collaborators are mocked — no live Paperless or database required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

vi.mock("../client", () => ({
  isPaperlessEnabled: vi.fn(),
  uploadPaperlessDocument: vi.fn(),
  waitForPaperlessDocument: vi.fn(),
}));

vi.mock("../db", () => ({
  withDocumentContext: vi.fn(),
  createDocumentLink: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  isPaperlessEnabled,
  uploadPaperlessDocument,
  waitForPaperlessDocument,
} from "../client";
import { withDocumentContext, createDocumentLink } from "../db";
import { syncReceiptToPaperless, buildReceiptTitle } from "../receipt-sync";

const mockEnabled = isPaperlessEnabled as ReturnType<typeof vi.fn>;
const mockUpload = uploadPaperlessDocument as ReturnType<typeof vi.fn>;
const mockWait = waitForPaperlessDocument as ReturnType<typeof vi.fn>;
const mockWithContext = withDocumentContext as ReturnType<typeof vi.fn>;
const mockCreateLink = createDocumentLink as ReturnType<typeof vi.fn>;

const session = {
  userId: "11111111-1111-1111-1111-111111111111",
  accountId: "22222222-2222-2222-2222-222222222222",
  role: "owner",
  traceId: "trace-1",
} as unknown as SessionPayload;

function input(overrides: Record<string, unknown> = {}) {
  return {
    session,
    expenseId: "33333333-3333-3333-3333-333333333333",
    vendorName: "Home Depot",
    expenseDate: "2026-06-12",
    data: Buffer.from("fake-image"),
    filename: "receipt.jpg",
    mimeType: "image/jpeg",
    traceId: "trace-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnabled.mockReturnValue(true);
  mockWithContext.mockImplementation(async (_session: unknown, fn: (client: unknown) => unknown) =>
    fn({})
  );
  mockCreateLink.mockResolvedValue({ id: "link-1" });
});

describe("buildReceiptTitle", () => {
  it("combines vendor and date", () => {
    expect(buildReceiptTitle("Home Depot", "2026-06-12")).toBe("Home Depot receipt 2026-06-12");
  });

  it("falls back when vendor or date are missing", () => {
    expect(buildReceiptTitle(null, "2026-06-12")).toBe("Receipt receipt 2026-06-12");
    expect(buildReceiptTitle("Lowe's", null)).toBe("Lowe's receipt");
    expect(buildReceiptTitle("  ", null)).toBe("Receipt receipt");
  });
});

describe("syncReceiptToPaperless", () => {
  it("uploads, waits for consumption, and links the document to the expense", async () => {
    mockUpload.mockResolvedValue("task-uuid");
    mockWait.mockResolvedValue(42);

    const result = await syncReceiptToPaperless(input());

    expect(result).toBe(42);
    expect(mockUpload).toHaveBeenCalledWith({
      data: expect.any(Buffer),
      filename: "receipt.jpg",
      mimeType: "image/jpeg",
      title: "Home Depot receipt 2026-06-12",
    });
    expect(mockWait).toHaveBeenCalledWith("task-uuid");
    expect(mockCreateLink).toHaveBeenCalledWith(expect.anything(), session.accountId, {
      entityType: "expense",
      entityId: "33333333-3333-3333-3333-333333333333",
      paperlessDocId: 42,
      title: "Home Depot receipt 2026-06-12",
      originalFilename: "receipt.jpg",
      createdBy: session.userId,
    });
  });

  it("does nothing when Paperless is not configured", async () => {
    mockEnabled.mockReturnValue(false);

    const result = await syncReceiptToPaperless(input());

    expect(result).toBeNull();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it("creates no link when the upload is rejected", async () => {
    mockUpload.mockResolvedValue(null);

    const result = await syncReceiptToPaperless(input());

    expect(result).toBeNull();
    expect(mockWait).not.toHaveBeenCalled();
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it("creates no link when consumption fails or times out", async () => {
    mockUpload.mockResolvedValue("task-uuid");
    mockWait.mockResolvedValue(null);

    const result = await syncReceiptToPaperless(input());

    expect(result).toBeNull();
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it("never throws when link creation fails", async () => {
    mockUpload.mockResolvedValue("task-uuid");
    mockWait.mockResolvedValue(42);
    mockWithContext.mockRejectedValue(new Error("db down"));

    await expect(syncReceiptToPaperless(input())).resolves.toBeNull();
  });
});
