import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN_INTEGRATION)("Automations API integration", () => {
  let pool: Pool;
  const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
  const TEST_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
  const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
  const ADMIN_COOKIE = "session=valid-admin-session";
  const TECH_COOKIE = "session=valid-tech-session";

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) return;
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  describe("GET /api/v1/automations", () => {
    it("returns 200 with automations array for authenticated user", async () => {
      const res = await fetch(BASE + "/api/v1/automations", {
        headers: { Cookie: ADMIN_COOKIE },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
    });

    it("returns 401 when not authenticated", async () => {
      const res = await fetch(BASE + "/api/v1/automations");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/v1/automations/events", () => {
    it("returns 200 with events array for authenticated user", async () => {
      const res = await fetch(BASE + "/api/v1/automations/events", {
        headers: { Cookie: ADMIN_COOKIE },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
    });

    it("returns 401 when not authenticated", async () => {
      const res = await fetch(BASE + "/api/v1/automations/events");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/automations/[id]/run", () => {
    it("returns 404 for non-existent automation", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000999";
      const res = await fetch(BASE + "/api/v1/automations/" + fakeId + "/run", {
        method: "POST",
        headers: {
          Cookie: ADMIN_COOKIE,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(404);
    });

    it("returns 403 for tech role", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000001";
      const res = await fetch(BASE + "/api/v1/automations/" + fakeId + "/run", {
        method: "POST",
        headers: {
          Cookie: TECH_COOKIE,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(403);
    });

    it("returns 401 when not authenticated", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000001";
      const res = await fetch(BASE + "/api/v1/automations/" + fakeId + "/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(401);
    });
  });
});
