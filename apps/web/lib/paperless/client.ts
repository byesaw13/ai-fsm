/**
 * Paperless-ngx API client — thin fetch wrapper.
 *
 * Design principles (ADR-020):
 * - ai-fsm is the source of truth; Paperless is a supporting document store.
 * - The client returns null / empty results if Paperless is not configured or
 *   unavailable, so no core workflow depends on it being reachable.
 * - All requests include a timeout so a slow Paperless instance never blocks
 *   the main request cycle.
 */

import { getEnv } from "@/lib/env";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PaperlessConfig {
  url: string;
  token: string;
}

/**
 * Return Paperless connection config, or null if the integration is not
 * configured (PAPERLESS_URL / PAPERLESS_API_TOKEN not set).
 */
export function getPaperlessConfig(): PaperlessConfig | null {
  const env = getEnv();
  if (!env.PAPERLESS_URL || !env.PAPERLESS_API_TOKEN) return null;
  return { url: env.PAPERLESS_URL.replace(/\/$/, ""), token: env.PAPERLESS_API_TOKEN };
}

/** True if Paperless integration is configured. */
export function isPaperlessEnabled(): boolean {
  return getPaperlessConfig() !== null;
}

// ---------------------------------------------------------------------------
// Types returned by Paperless API
// ---------------------------------------------------------------------------

export interface PaperlessDocument {
  id: number;
  title: string;
  original_file_name: string | null;
  correspondent: number | null;
  document_type: number | null;
  tags: number[];
  created: string;       // ISO date string
  added: string;         // ISO date string
  archive_serial_number: string | null;
  content: string | null;
}

export interface PaperlessSearchResult {
  count: number;
  results: PaperlessDocument[];
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 5000;
const UPLOAD_TIMEOUT_MS = 30_000;

async function paperlessFetch(
  config: PaperlessConfig,
  path: string,
  params?: Record<string, string>
): Promise<Response> {
  const url = new URL(`${config.url}/api${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Token ${config.token}`,
        Accept: "application/json; version=5",
      },
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

/**
 * Fetch a single Paperless document by ID.
 * Returns null if Paperless is not configured, unavailable, or the document
 * does not exist.
 */
export async function fetchPaperlessDocument(
  docId: number
): Promise<PaperlessDocument | null> {
  const config = getPaperlessConfig();
  if (!config) return null;

  try {
    const response = await paperlessFetch(config, `/documents/${docId}/`);
    if (!response.ok) return null;
    return (await response.json()) as PaperlessDocument;
  } catch {
    return null;
  }
}

/**
 * Search Paperless documents by title / full-text query.
 * Returns empty results if Paperless is not configured or unavailable.
 *
 * @param query   Free-text search string
 * @param pageSize  Max results to return (default 20, Paperless max 100)
 */
export async function searchPaperlessDocuments(
  query: string,
  pageSize = 20
): Promise<PaperlessSearchResult> {
  const config = getPaperlessConfig();
  if (!config) return { count: 0, results: [] };

  try {
    const response = await paperlessFetch(config, "/documents/", {
      search: query,
      page_size: String(Math.min(pageSize, 100)),
    });
    if (!response.ok) return { count: 0, results: [] };
    return (await response.json()) as PaperlessSearchResult;
  } catch {
    return { count: 0, results: [] };
  }
}

/**
 * Upload a document to Paperless for consumption (OCR + indexing).
 * Returns the consume task UUID, or null if Paperless is not configured,
 * unavailable, or rejected the upload. Consumption is asynchronous — use
 * waitForPaperlessDocument to resolve the task into a document ID.
 */
export async function uploadPaperlessDocument(opts: {
  data: Buffer | Uint8Array;
  filename: string;
  mimeType: string;
  title?: string;
}): Promise<string | null> {
  const config = getPaperlessConfig();
  if (!config) return null;

  const form = new FormData();
  form.append(
    "document",
    new Blob([opts.data as BlobPart], { type: opts.mimeType }),
    opts.filename
  );
  if (opts.title) form.append("title", opts.title);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/api/documents/post_document/`, {
      method: "POST",
      headers: { Authorization: `Token ${config.token}` },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    // Paperless returns the task UUID as a JSON-encoded string.
    const taskId = (await response.json()) as unknown;
    return typeof taskId === "string" && taskId.length > 0 ? taskId : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface PaperlessTask {
  task_id: string;
  status: "PENDING" | "STARTED" | "SUCCESS" | "FAILURE";
  related_document: string | null;
  result: string | null;
}

/**
 * Fetch the status of a Paperless consume task.
 * Returns null if Paperless is unreachable or the task is unknown.
 */
export async function getPaperlessTask(taskId: string): Promise<PaperlessTask | null> {
  const config = getPaperlessConfig();
  if (!config) return null;

  try {
    const response = await paperlessFetch(config, "/tasks/", { task_id: taskId });
    if (!response.ok) return null;
    const tasks = (await response.json()) as PaperlessTask[];
    return Array.isArray(tasks) && tasks.length > 0 ? tasks[0] : null;
  } catch {
    return null;
  }
}

/**
 * Poll a consume task until it reaches a terminal state and return the
 * resulting document ID. Returns null on failure, timeout, or if Paperless
 * becomes unreachable. Intended for background (after-response) use only —
 * never call this on the critical path of a request.
 */
export async function waitForPaperlessDocument(
  taskId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<number | null> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const task = await getPaperlessTask(taskId);
    if (task?.status === "SUCCESS") {
      const docId = task.related_document ? parseInt(task.related_document, 10) : NaN;
      return Number.isFinite(docId) ? docId : null;
    }
    if (task?.status === "FAILURE") return null;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

/**
 * Resolve the direct download URL for a Paperless document.
 * This URL requires authentication (token in Authorization header) and is
 * intended for server-side proxy use, not direct browser links.
 */
export function paperlessDownloadUrl(config: PaperlessConfig, docId: number): string {
  return `${config.url}/api/documents/${docId}/download/`;
}
