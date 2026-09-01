/**
 * Resolve where to send the user after a successful login.
 *
 * Mirrors WorkspaceAutoRoute rules so we do not land on /app/my-work and then
 * immediately client-redirect to /app (which feels like a login "loop").
 */

export type PostLoginRole = "owner" | "admin" | "tech" | string;

const COOKIE_MODE = "dv_ws_mode";
const OFFICE_ROOT = "/app";
const FIELD_ROOT = "/app/my-work";
export const CAPTURE_PATH = "/app/capture";

/** Open-redirect allowlist: honor `next` only when it is exactly /app/capture. */
export function allowlistedPostLoginNext(
  next: string | null | undefined,
): string | null {
  return next === CAPTURE_PATH ? CAPTURE_PATH : null;
}

export function loginRedirectForPath(pathname: string | null | undefined): string {
  return pathname === CAPTURE_PATH ? `/login?next=${CAPTURE_PATH}` : "/login";
}

export function pathnameFromHeaders(headerList: {
  get(name: string): string | null;
}): string {
  const candidates = [
    headerList.get("x-matched-path"),
    headerList.get("x-invoke-path"),
    headerList.get("next-url"),
    headerList.get("x-url"),
    headerList.get("x-forwarded-uri"),
    headerList.get("x-original-uri"),
    headerList.get("x-pathname"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const path =
        raw.startsWith("http://") || raw.startsWith("https://")
          ? new URL(raw).pathname
          : raw.split("?")[0];
      if (path) return path;
    } catch {
      continue;
    }
  }
  return "";
}

export function readWorkspaceModeCookie(
  cookieSource: string | null | undefined,
): "field" | "office" | null {
  if (!cookieSource) return null;
  const m = cookieSource.match(new RegExp(`(?:^|; )${COOKIE_MODE}=([^;]*)`));
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  return v === "field" || v === "office" ? v : null;
}

/**
 * @param role - session role from login response
 * @param opts.cookieHeader - document.cookie or Cookie request header
 * @param opts.isPhone - true when viewport is phone-sized (≤767px)
 */
export function resolvePostLoginHref(
  role: PostLoginRole,
  opts: { cookieHeader?: string | null; isPhone?: boolean; next?: string | null } = {},
): string {
  const allowedNext = allowlistedPostLoginNext(opts.next);
  if (allowedNext) return allowedNext;

  if (role === "tech") return FIELD_ROOT;
  if (role === "admin") return OFFICE_ROOT;

  // owner (and any unknown role that can use both surfaces)
  const explicit = readWorkspaceModeCookie(opts.cookieHeader ?? null);
  const mode =
    explicit === "field" || explicit === "office"
      ? explicit
      : opts.isPhone
        ? "field"
        : "office";
  return mode === "field" ? FIELD_ROOT : OFFICE_ROOT;
}
