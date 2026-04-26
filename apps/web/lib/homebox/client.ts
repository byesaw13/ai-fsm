/**
 * Homebox API client.
 *
 * Design:
 * - ai-fsm is the source of truth. Homebox is a supporting asset store.
 * - Returns null / empty results when not configured or unavailable so no
 *   core workflow depends on Homebox being reachable.
 * - Token is cached in module scope with expiry; re-authenticated on 401.
 * - All requests include a 5-second timeout.
 */

import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

const REQUEST_TIMEOUT_MS = 5_000;

export interface HomeboxConfig {
  url: string;
  user: string;
  password: string;
}

export interface HomeboxItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  location: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
  archived: boolean;
}

export interface HomeboxSearchResult {
  total: number;
  items: HomeboxItem[];
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function getHomeboxConfig(): HomeboxConfig | null {
  const env = getEnv();
  if (!env.HOMEBOX_URL || !env.HOMEBOX_USER || !env.HOMEBOX_PASSWORD) return null;
  return {
    url: env.HOMEBOX_URL.replace(/\/$/, ""),
    user: env.HOMEBOX_USER,
    password: env.HOMEBOX_PASSWORD,
  };
}

export function isHomeboxEnabled(): boolean {
  return getHomeboxConfig() !== null;
}

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

let cachedToken: string | null = null;
let tokenExpiresAt: Date | null = null;

function tokenValid(): boolean {
  if (!cachedToken || !tokenExpiresAt) return false;
  // Refresh 5 minutes before expiry
  return tokenExpiresAt.getTime() - Date.now() > 5 * 60 * 1000;
}

async function authenticate(cfg: HomeboxConfig): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url}/api/v1/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: cfg.user, password: cfg.password }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Homebox auth failed: ${res.status}`);
    const data = (await res.json()) as { token: string; expiresAt: string };
    cachedToken = data.token;
    tokenExpiresAt = new Date(data.expiresAt);
    return cachedToken;
  } finally {
    clearTimeout(timer);
  }
}

async function getToken(cfg: HomeboxConfig): Promise<string> {
  if (tokenValid()) return cachedToken!;
  return authenticate(cfg);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async function hbFetch(cfg: HomeboxConfig, path: string, retried = false): Promise<Response> {
  const token = await getToken(cfg);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url}/api/v1${path}`, {
      headers: { Authorization: token },
      signal: controller.signal,
    });
    if (res.status === 401 && !retried) {
      cachedToken = null;
      tokenExpiresAt = null;
      return hbFetch(cfg, path, true);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchHomeboxItems(
  q: string,
  pageSize = 20
): Promise<HomeboxSearchResult> {
  const cfg = getHomeboxConfig();
  if (!cfg) return { total: 0, items: [] };
  try {
    const params = new URLSearchParams({
      q,
      page: "1",
      pageSize: String(pageSize),
    });
    const res = await hbFetch(cfg, `/items?${params}`);
    if (!res.ok) return { total: 0, items: [] };
    const data = (await res.json()) as {
      total: number;
      items: Array<{
        id: string;
        name: string;
        description: string;
        quantity: number;
        archived: boolean;
        location: { id: string; name: string } | null;
        tags: { id: string; name: string }[];
      }>;
    };
    return {
      total: data.total,
      items: (data.items ?? [])
        .filter((i) => !i.archived)
        .map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description || null,
          quantity: i.quantity,
          location: i.location ?? null,
          tags: i.tags ?? [],
          archived: i.archived,
        })),
    };
  } catch (err) {
    logger.error("homebox: searchItems failed", err);
    return { total: 0, items: [] };
  }
}

export async function fetchHomeboxItem(itemId: string): Promise<HomeboxItem | null> {
  const cfg = getHomeboxConfig();
  if (!cfg) return null;
  try {
    const res = await hbFetch(cfg, `/items/${itemId}`);
    if (!res.ok) return null;
    const i = (await res.json()) as {
      id: string;
      name: string;
      description: string;
      quantity: number;
      archived: boolean;
      location: { id: string; name: string } | null;
      tags: { id: string; name: string }[];
    };
    return {
      id: i.id,
      name: i.name,
      description: i.description || null,
      quantity: i.quantity,
      location: i.location ?? null,
      tags: i.tags ?? [],
      archived: i.archived,
    };
  } catch (err) {
    logger.error("homebox: fetchItem failed", err);
    return null;
  }
}
