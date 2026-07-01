import { describe, it, expect } from "vitest";

const RUN_HTTP_INTEGRATION =
  !!process.env.TEST_BASE_URL && !!process.env.TEST_DATABASE_URL;

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const INTERNAL_KEY = process.env.LOCATION_INTERNAL_KEY ?? "test-key";

async function postInternal(path: string) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "x-api-key": INTERNAL_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@test.com", password: "password" }),
  });
  return res.headers.get("set-cookie")?.match(/fsm_session=[^;]+/)?.[0] ?? "";
}

describe.skipIf(!RUN_HTTP_INTEGRATION)("Internal endpoints", () => {
  describe("POST /api/internal/start-day-prompt", () => {
    it("returns 401 without key", async () => {
      const res = await fetch(`${BASE_URL}/api/internal/start-day-prompt`, { method: "POST" });
      expect(res.status).toBe(401);
    });

    it("returns a valid signal with auth key", async () => {
      const res = await postInternal("/api/internal/start-day-prompt");
      expect(res.status).toBe(200);
      const body = await res.json() as { signal: string };
      expect(["start", "suppress_weekend", "already_started", "no_action"]).toContain(body.signal);
    });
  });

  describe("POST /api/internal/day-review-prompt", () => {
    it("returns 401 without key", async () => {
      const res = await fetch(`${BASE_URL}/api/internal/day-review-prompt`, { method: "POST" });
      expect(res.status).toBe(401);
    });

    it("returns a valid result with auth key", async () => {
      const res = await postInternal("/api/internal/day-review-prompt");
      expect(res.status).toBe(200);
      const body = await res.json() as { result: string };
      expect(["prompted", "skipped"]).toContain(body.result);
    });
  });
});

describe.skipIf(!RUN_HTTP_INTEGRATION)("Day Review API", () => {
  describe("GET /api/v1/day-review/:date", () => {
    it("returns 400 for invalid date", async () => {
      const session = await login();
      const res = await fetch(`${BASE_URL}/api/v1/day-review/not-a-date`, {
        headers: { Cookie: session },
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for date with no business day", async () => {
      const session = await login();
      const res = await fetch(`${BASE_URL}/api/v1/day-review/1990-01-01`, {
        headers: { Cookie: session },
      });
      expect(res.status).toBe(404);
    });

    it("returns 401 without auth", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/day-review/2026-07-01`);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/day-review/close", () => {
    it("returns 400 without id", async () => {
      const session = await login();
      const res = await fetch(`${BASE_URL}/api/v1/day-review/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: session },
        body: "{}",
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for unknown id", async () => {
      const session = await login();
      const res = await fetch(`${BASE_URL}/api/v1/day-review/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: session },
        body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }),
      });
      expect(res.status).toBe(404);
    });
  });
});
