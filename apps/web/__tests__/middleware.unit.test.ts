import { describe, it, expect } from "vitest";
import { middleware } from "../middleware";
import { NextRequest } from "next/server";

function makeRequest(path = "/app/jobs"): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe("security headers middleware", () => {
  it("sets X-Frame-Options: DENY", async () => {
    const res = middleware(makeRequest());
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets X-Content-Type-Options: nosniff", async () => {
    const res = middleware(makeRequest());
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets Referrer-Policy", async () => {
    const res = middleware(makeRequest());
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  it("sets Permissions-Policy disabling unused APIs", async () => {
    const res = middleware(makeRequest());
    const policy = res.headers.get("Permissions-Policy") ?? "";
    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("geolocation=()");
  });

  it("sets Content-Security-Policy with frame-ancestors none", async () => {
    const res = middleware(makeRequest());
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
  });

  it("sets Strict-Transport-Security", async () => {
    const res = middleware(makeRequest());
    const hsts = res.headers.get("Strict-Transport-Security") ?? "";
    expect(hsts).toContain("max-age=31536000");
    expect(hsts).toContain("includeSubDomains");
  });

  it("applies headers to API routes", async () => {
    const res = middleware(makeRequest("/api/v1/jobs"));
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("applies headers to auth routes", async () => {
    const res = middleware(makeRequest("/api/v1/auth/login"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
