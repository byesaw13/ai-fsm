/**
 * Unit tests for Paperless-ngx integration helpers.
 *
 * All tests mock fetch and getEnv — no live Paperless instance required.
 * Tier 1/2: pure logic and mock API behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock getEnv so tests control whether Paperless is configured
// ---------------------------------------------------------------------------

vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(),
}));

import { getEnv } from "@/lib/env";
import {
  getPaperlessConfig,
  isPaperlessEnabled,
  fetchPaperlessDocument,
  searchPaperlessDocuments,
  paperlessDownloadUrl,
  type PaperlessConfig,
} from "../client";

const mockGetEnv = getEnv as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withPaperless(url = "http://paperless.local:8000", token = "testtoken") {
  mockGetEnv.mockReturnValue({ PAPERLESS_URL: url, PAPERLESS_API_TOKEN: token });
}

function withoutPaperless() {
  mockGetEnv.mockReturnValue({ PAPERLESS_URL: undefined, PAPERLESS_API_TOKEN: undefined });
}

// ---------------------------------------------------------------------------
// getPaperlessConfig
// ---------------------------------------------------------------------------

describe("getPaperlessConfig", () => {
  it("returns null when PAPERLESS_URL is not set", () => {
    withoutPaperless();
    expect(getPaperlessConfig()).toBeNull();
  });

  it("returns null when only PAPERLESS_URL is set (token missing)", () => {
    mockGetEnv.mockReturnValue({ PAPERLESS_URL: "http://paperless.local", PAPERLESS_API_TOKEN: undefined });
    expect(getPaperlessConfig()).toBeNull();
  });

  it("returns null when only PAPERLESS_API_TOKEN is set (URL missing)", () => {
    mockGetEnv.mockReturnValue({ PAPERLESS_URL: undefined, PAPERLESS_API_TOKEN: "tok" });
    expect(getPaperlessConfig()).toBeNull();
  });

  it("returns config when both vars are set", () => {
    withPaperless("http://paperless.local:8000", "mytoken");
    const config = getPaperlessConfig();
    expect(config).not.toBeNull();
    expect(config!.url).toBe("http://paperless.local:8000");
    expect(config!.token).toBe("mytoken");
  });

  it("strips trailing slash from URL", () => {
    mockGetEnv.mockReturnValue({
      PAPERLESS_URL: "http://paperless.local:8000/",
      PAPERLESS_API_TOKEN: "tok",
    });
    expect(getPaperlessConfig()!.url).toBe("http://paperless.local:8000");
  });
});

// ---------------------------------------------------------------------------
// isPaperlessEnabled
// ---------------------------------------------------------------------------

describe("isPaperlessEnabled", () => {
  it("returns false when not configured", () => {
    withoutPaperless();
    expect(isPaperlessEnabled()).toBe(false);
  });

  it("returns true when fully configured", () => {
    withPaperless();
    expect(isPaperlessEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// paperlessDownloadUrl
// ---------------------------------------------------------------------------

describe("paperlessDownloadUrl", () => {
  it("constructs the correct download URL", () => {
    const config: PaperlessConfig = { url: "http://paperless.local:8000", token: "tok" };
    expect(paperlessDownloadUrl(config, 42)).toBe(
      "http://paperless.local:8000/api/documents/42/download/"
    );
  });
});

// ---------------------------------------------------------------------------
// fetchPaperlessDocument
// ---------------------------------------------------------------------------

describe("fetchPaperlessDocument", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when Paperless is not configured", async () => {
    withoutPaperless();
    expect(await fetchPaperlessDocument(1)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns document on successful fetch", async () => {
    withPaperless();
    const doc = { id: 42, title: "Receipt Jan", original_file_name: "receipt.pdf" };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => doc,
    } as Response);

    const result = await fetchPaperlessDocument(42);
    expect(result).toEqual(doc);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/documents/42/"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Token testtoken" }),
      })
    );
  });

  it("returns null on HTTP 404", async () => {
    withPaperless();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    expect(await fetchPaperlessDocument(99)).toBeNull();
  });

  it("returns null on network error (graceful degradation)", async () => {
    withPaperless();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network error"));
    expect(await fetchPaperlessDocument(1)).toBeNull();
  });

  it("returns null on timeout (AbortError)", async () => {
    withPaperless();
    vi.mocked(fetch).mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );
    expect(await fetchPaperlessDocument(1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// searchPaperlessDocuments
// ---------------------------------------------------------------------------

describe("searchPaperlessDocuments", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty results when Paperless is not configured", async () => {
    withoutPaperless();
    const result = await searchPaperlessDocuments("invoice");
    expect(result).toEqual({ count: 0, results: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns search results on success", async () => {
    withPaperless();
    const payload = {
      count: 2,
      results: [
        { id: 1, title: "Invoice A", original_file_name: "inv-a.pdf" },
        { id: 2, title: "Invoice B", original_file_name: "inv-b.pdf" },
      ],
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => payload,
    } as Response);

    const result = await searchPaperlessDocuments("invoice");
    expect(result.count).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].title).toBe("Invoice A");
  });

  it("passes the search query as a URL param", async () => {
    withPaperless();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 0, results: [] }),
    } as Response);

    await searchPaperlessDocuments("receipt vendor");
    const calledUrl = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(calledUrl).toContain("search=receipt+vendor");
  });

  it("caps page_size at 100", async () => {
    withPaperless();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 0, results: [] }),
    } as Response);

    await searchPaperlessDocuments("x", 999);
    const calledUrl = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(calledUrl).toContain("page_size=100");
  });

  it("returns empty results on HTTP error", async () => {
    withPaperless();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    const result = await searchPaperlessDocuments("test");
    expect(result).toEqual({ count: 0, results: [] });
  });

  it("returns empty results on network error (graceful degradation)", async () => {
    withPaperless();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await searchPaperlessDocuments("test");
    expect(result).toEqual({ count: 0, results: [] });
  });
});

// ---------------------------------------------------------------------------
// Integration boundary — domain schemas
// ---------------------------------------------------------------------------

import {
  documentLinkSchema,
  createDocumentLinkSchema,
  documentLinkEntityTypeSchema,
} from "@ai-fsm/domain";

describe("documentLinkEntityTypeSchema", () => {
  const validTypes = ["expense", "job", "client", "property", "invoice", "estimate"];

  it("accepts all valid entity types", () => {
    for (const t of validTypes) {
      expect(() => documentLinkEntityTypeSchema.parse(t)).not.toThrow();
    }
  });

  it("rejects unknown entity types", () => {
    expect(() => documentLinkEntityTypeSchema.parse("payment")).toThrow();
    expect(() => documentLinkEntityTypeSchema.parse("")).toThrow();
    expect(() => documentLinkEntityTypeSchema.parse("Expense")).toThrow();
  });
});

describe("documentLinkSchema", () => {
  const validLink = {
    id: "00000000-0000-0000-0000-000000000001",
    account_id: "00000000-0000-0000-0000-000000000002",
    entity_type: "expense" as const,
    entity_id: "00000000-0000-0000-0000-000000000003",
    paperless_doc_id: 42,
    title: "January receipt",
    original_filename: "receipt.pdf",
    created_by: "00000000-0000-0000-0000-000000000004",
    created_at: "2026-01-15T10:00:00Z",
  };

  it("parses a valid document link", () => {
    expect(() => documentLinkSchema.parse(validLink)).not.toThrow();
  });

  it("accepts null title and original_filename", () => {
    expect(() =>
      documentLinkSchema.parse({ ...validLink, title: null, original_filename: null })
    ).not.toThrow();
  });

  it("rejects non-positive paperless_doc_id", () => {
    expect(() => documentLinkSchema.parse({ ...validLink, paperless_doc_id: 0 })).toThrow();
    expect(() => documentLinkSchema.parse({ ...validLink, paperless_doc_id: -1 })).toThrow();
  });

  it("rejects non-integer paperless_doc_id", () => {
    expect(() => documentLinkSchema.parse({ ...validLink, paperless_doc_id: 1.5 })).toThrow();
  });
});

describe("createDocumentLinkSchema", () => {
  const validInput = {
    entity_type: "expense" as const,
    entity_id: "00000000-0000-0000-0000-000000000001",
    paperless_doc_id: 1,
  };

  it("accepts a minimal valid input", () => {
    expect(() => createDocumentLinkSchema.parse(validInput)).not.toThrow();
  });

  it("accepts optional title and original_filename", () => {
    expect(() =>
      createDocumentLinkSchema.parse({
        ...validInput,
        title: "My doc",
        original_filename: "doc.pdf",
      })
    ).not.toThrow();
  });

  it("rejects entity_id that is not a UUID", () => {
    expect(() =>
      createDocumentLinkSchema.parse({ ...validInput, entity_id: "not-a-uuid" })
    ).toThrow();
  });

  it("rejects title over 500 characters", () => {
    expect(() =>
      createDocumentLinkSchema.parse({ ...validInput, title: "a".repeat(501) })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// uploadPaperlessDocument / getPaperlessTask / waitForPaperlessDocument
// ---------------------------------------------------------------------------

import {
  uploadPaperlessDocument,
  getPaperlessTask,
  waitForPaperlessDocument,
} from "../client";

describe("uploadPaperlessDocument", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const uploadOpts = {
    data: Buffer.from("img"),
    filename: "receipt.jpg",
    mimeType: "image/jpeg",
    title: "Home Depot receipt 2026-06-12",
  };

  it("returns null when Paperless is not configured", async () => {
    withoutPaperless();
    expect(await uploadPaperlessDocument(uploadOpts)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts multipart form and returns the task UUID", async () => {
    withPaperless();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify("task-uuid-1"), { status: 200 })
    );

    const taskId = await uploadPaperlessDocument(uploadOpts);

    expect(taskId).toBe("task-uuid-1");
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://paperless.local:8000/api/documents/post_document/");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Token testtoken");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get("title")).toBe("Home Depot receipt 2026-06-12");
  });

  it("returns null on a rejected upload", async () => {
    withPaperless();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("bad", { status: 400 })
    );
    expect(await uploadPaperlessDocument(uploadOpts)).toBeNull();
  });

  it("returns null on network failure", async () => {
    withPaperless();
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("refused"));
    expect(await uploadPaperlessDocument(uploadOpts)).toBeNull();
  });
});

describe("getPaperlessTask / waitForPaperlessDocument", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function taskResponse(status: string, relatedDocument: string | null) {
    return new Response(
      JSON.stringify([
        { task_id: "t1", status, related_document: relatedDocument, result: null },
      ]),
      { status: 200 }
    );
  }

  it("returns the first matching task", async () => {
    withPaperless();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(taskResponse("SUCCESS", "42"));

    const task = await getPaperlessTask("t1");
    expect(task?.status).toBe("SUCCESS");
    expect(task?.related_document).toBe("42");
  });

  it("resolves the document id once the task succeeds", async () => {
    withPaperless();
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(taskResponse("STARTED", null))
      .mockResolvedValueOnce(taskResponse("SUCCESS", "42"));

    const docId = await waitForPaperlessDocument("t1", { timeoutMs: 2000, intervalMs: 10 });
    expect(docId).toBe(42);
  });

  it("returns null when the task fails", async () => {
    withPaperless();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(taskResponse("FAILURE", null));

    expect(await waitForPaperlessDocument("t1", { timeoutMs: 2000, intervalMs: 10 })).toBeNull();
  });

  it("returns null on timeout while the task is pending", async () => {
    withPaperless();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(taskResponse("PENDING", null));

    expect(await waitForPaperlessDocument("t1", { timeoutMs: 50, intervalMs: 10 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Permission: canLinkDocuments
// ---------------------------------------------------------------------------

import { canLinkDocuments } from "../../auth/permissions";

describe("canLinkDocuments", () => {
  it("allows owner", () => expect(canLinkDocuments("owner")).toBe(true));
  it("allows admin", () => expect(canLinkDocuments("admin")).toBe(true));
  it("denies tech", () => expect(canLinkDocuments("tech")).toBe(false));
});
