import { describe, it, expect } from "vitest";
import { checkBusinessRules, isSensitiveBusinessFile, referencedScopedTable, isPublicRoute } from "../business-rules.js";
import { file } from "./helpers.js";

describe("payment/invoice/Square require tests", () => {
  it("blocks a sensitive change with no test change", () => {
    const findings = checkBusinessRules([
      file("apps/web/lib/invoices/billing.ts", { added: ["const x = 1;"] }),
    ]);
    const f = findings.filter((x) => x.rule === "business.payment-change-without-tests");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("blocking");
  });

  it("passes when a test changes alongside", () => {
    const findings = checkBusinessRules([
      file("apps/web/lib/invoices/billing.ts", { added: ["const x = 1;"] }),
      file("apps/web/lib/invoices/__tests__/billing.test.ts", { added: ["it()"] }),
    ]);
    expect(findings.filter((x) => x.rule === "business.payment-change-without-tests")).toHaveLength(0);
  });

  it("isSensitiveBusinessFile matches money paths but not tests", () => {
    expect(isSensitiveBusinessFile("apps/web/lib/integrations/square.ts")).toBe(true);
    expect(isSensitiveBusinessFile("services/worker/src/invoice-followup.ts")).toBe(true);
    expect(isSensitiveBusinessFile("apps/web/lib/invoices/__tests__/billing.test.ts")).toBe(false);
    expect(isSensitiveBusinessFile("apps/web/lib/crm/p7.ts")).toBe(false);
  });
});

describe("account_id scoping in new SQL", () => {
  it("warns when new SQL hits a scoped table with no scope marker", () => {
    const findings = checkBusinessRules([
      file("apps/web/lib/reports/db.ts", {
        added: ["const rows = await query(`SELECT * FROM invoices WHERE status = 'sent'`);"],
      }),
    ]);
    const f = findings.filter((x) => x.rule === "business.sql-missing-account-scope");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("warning");
    expect(f[0].message).toContain("invoices");
  });

  it("does not warn when the file uses account_id", () => {
    const findings = checkBusinessRules([
      file("apps/web/lib/reports/db.ts", {
        added: ["`SELECT * FROM invoices WHERE account_id = $1`"],
      }),
    ]);
    expect(findings.filter((x) => x.rule === "business.sql-missing-account-scope")).toHaveLength(0);
  });

  it("does not warn when the file uses a session/RLS context helper", () => {
    const findings = checkBusinessRules([
      file("apps/web/lib/reports/db.ts", {
        added: ["await queryForSession(session, `SELECT * FROM jobs`);"],
        content: "import { queryForSession } from '../db';\nawait queryForSession(session, `SELECT * FROM jobs`);",
      }),
    ]);
    expect(findings.filter((x) => x.rule === "business.sql-missing-account-scope")).toHaveLength(0);
  });

  it("referencedScopedTable detects table refs", () => {
    expect(referencedScopedTable("SELECT * FROM payments p")).toBe("payments");
    expect(referencedScopedTable("JOIN clients c ON c.id = x")).toBe("clients");
    expect(referencedScopedTable("SELECT now()")).toBeNull();
  });
});

describe("route role guards", () => {
  const MUT = "apps/web/app/api/v1/widgets/route.ts";

  it("blocks a mutating route with no withRole/withAuth", () => {
    const findings = checkBusinessRules([
      file(MUT, { content: "export const POST = async () => {}" }),
    ]);
    const f = findings.filter((x) => x.rule === "business.route-missing-role-guard");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("blocking");
  });

  it("passes a mutating route guarded by withRole", () => {
    const findings = checkBusinessRules([
      file(MUT, { content: "export const POST = withRole(['owner','admin'], handler)" }),
    ]);
    expect(findings.filter((x) => x.rule === "business.route-missing-role-guard")).toHaveLength(0);
  });

  it("skips the role-guard rule for public/webhook/portal routes", () => {
    const findings = checkBusinessRules([
      // Use a non-"square"/payment path so only the route-guard rule is in play.
      file("apps/web/app/api/webhooks/inbound/route.ts", { content: "export const POST = async () => {}" }),
    ]);
    expect(findings.filter((f) => f.rule === "business.route-missing-role-guard")).toHaveLength(0);
    expect(isPublicRoute("webhooks/square")).toBe(true);
    expect(isPublicRoute("v1/widgets")).toBe(false);
  });

  it("warns on an unguarded GET route that is not public", () => {
    const findings = checkBusinessRules([
      file("apps/web/app/api/v1/widgets/route.ts", { content: "export const GET = async () => {}" }),
    ]);
    const f = findings.filter((x) => x.rule === "business.read-route-unguarded");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("warning");
  });
});
