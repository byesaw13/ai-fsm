/**
 * Web Push payload shaping (EPIC-005 TASK-118). Pure — no I/O — so it is unit
 * tested and shared by every trigger. The service worker reads `title`, `body`,
 * `data.url`, and `tag` (see public/sw.js).
 */

export interface PushInput {
  title: string;
  body?: string;
  /** Where notificationclick navigates. Defaults to the app root. */
  url?: string;
  /** Collapse key — a later push with the same tag replaces the earlier one. */
  tag?: string;
}

export interface PushMessage {
  title: string;
  body: string;
  tag: string;
  data: { url: string };
}

const TITLE_MAX = 80;
const BODY_MAX = 180;

function clamp(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Normalize a trigger's input into the wire message: clamp lengths, default the
 * url to "/", and fall back to a per-message tag so distinct notifications don't
 * silently collapse. Returns the object; callers JSON.stringify for transport.
 */
export function buildPushPayload(input: PushInput): PushMessage {
  const url = input.url && input.url.startsWith("/") ? input.url : "/";
  return {
    title: clamp(input.title || "Dovetails", TITLE_MAX),
    body: clamp(input.body ?? "", BODY_MAX),
    tag: (input.tag && input.tag.trim()) || `dovetails-${url}`,
    data: { url },
  };
}
