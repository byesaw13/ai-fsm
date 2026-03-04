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
 * Resolve the direct download URL for a Paperless document.
 * This URL requires authentication (token in Authorization header) and is
 * intended for server-side proxy use, not direct browser links.
 */
export function paperlessDownloadUrl(config: PaperlessConfig, docId: number): string {
  return `${config.url}/api/documents/${docId}/download/`;
}
