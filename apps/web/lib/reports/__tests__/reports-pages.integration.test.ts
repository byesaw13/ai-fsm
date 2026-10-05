import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

// Reports read the business timezone from automation_settings. A query against
// the pre-066 table name (automation_rules) crashed both pages in production
// while unit tests, which never touch SQL, stayed green.
const RUN = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_BASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe.skipIf(!RUN)("reports pages render", () => {
  let adminCookie = "";

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `it-reports-pages-${randomUUID()}` },
      body: JSON.stringify({ email: "admin@test.com", password: "password" }),
    });
    expect(login.status).toBe(200);
    adminCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  });

  // The pages stream behind loading.tsx, so a failed query still answers 200.
  // Assert on text only the finished page renders.
  const pages: Array<[string, string]> = [
    ["/app/reports", "Cash Collected"],
    ["/app/reports?month=2026-03", "Cash Collected"],
    ["/app/reports/close", "Invoices created:"],
  ];
  for (const [path, marker] of pages) {
    it(`${path} renders`, async () => {
      const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: adminCookie }, redirect: "manual" });
      expect(res.status).toBe(200);
      expect(await res.text()).toContain(marker);
    });
  }
});
