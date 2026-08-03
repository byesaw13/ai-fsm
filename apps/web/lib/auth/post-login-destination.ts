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
  opts: { cookieHeader?: string | null; isPhone?: boolean } = {},
): string {
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
