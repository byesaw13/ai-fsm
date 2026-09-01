import { describe, expect, it } from "vitest";
import {
  allowlistedPostLoginNext,
  loginRedirectForPath,
  pathnameFromHeaders,
  resolvePostLoginHref,
} from "@/lib/auth/post-login-destination";

describe("capture post-login allowlist", () => {
  it("honors next only when it is exactly /app/capture", () => {
    expect(allowlistedPostLoginNext("/app/capture")).toBe("/app/capture");
    expect(allowlistedPostLoginNext("/app/capture/")).toBeNull();
    expect(allowlistedPostLoginNext("/app")).toBeNull();
    expect(allowlistedPostLoginNext("https://evil.example/app/capture")).toBeNull();
    expect(allowlistedPostLoginNext("//evil.example")).toBeNull();
  });

  it("lands on /app/capture after login when next is allowlisted", () => {
    expect(
      resolvePostLoginHref("owner", { isPhone: true, next: "/app/capture" }),
    ).toBe("/app/capture");
    expect(
      resolvePostLoginHref("admin", { next: "/app/jobs" }),
    ).toBe("/app");
  });

  it("sends unauthenticated /app/capture to login with next", () => {
    expect(loginRedirectForPath("/app/capture")).toBe("/login?next=/app/capture");
    expect(loginRedirectForPath("/app")).toBe("/login");
  });

  it("reads /app/capture from request headers", () => {
    const headers = new Headers({
      "x-matched-path": "/app/capture",
    });
    expect(pathnameFromHeaders(headers)).toBe("/app/capture");
    expect(
      pathnameFromHeaders(new Headers({ "next-url": "http://localhost:3000/app/capture" })),
    ).toBe("/app/capture");
  });
});
