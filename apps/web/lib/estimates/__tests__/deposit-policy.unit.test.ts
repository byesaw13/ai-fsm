import { describe, expect, it, vi } from "vitest";
import { estimateEmailHtml, estimateEmailText } from "@ai-fsm/email-templates";
import { calculateDepositPolicy, depositDueTriggerLabel, estimateMaterialsDepositBasis } from "../deposit-policy";
import { createApprovalArtifacts } from "../approve";

vi.mock("@/lib/invoices/db", () => ({
  generateInvoiceNumber: vi.fn(async () => "INV-TEST"),
}));

describe("calculateDepositPolicy", () => {
  it("estimate with no deposit leaves the full balance due", () => {
    const r = calculateDepositPolicy({ total_cents: 100000, deposit_required: false });
    expect(r.deposit_cents).toBe(0);
    expect(r.balance_cents).toBe(100000);
    expect(r.deposit_type).toBe("none");
  });

  it("estimate with 30% deposit calculates only when explicitly selected", () => {
    const r = calculateDepositPolicy({ total_cents: 100000, deposit_required: true, deposit_type: "percentage", deposit_percentage: 30 });
    expect(r.deposit_cents).toBe(30000);
    expect(r.balance_cents).toBe(70000);
  });

  it("estimate with fixed deposit clamps to the project total", () => {
    const r = calculateDepositPolicy({ total_cents: 50000, deposit_required: true, deposit_type: "fixed", deposit_fixed_cents: 75000 });
    expect(r.deposit_cents).toBe(50000);
    expect(r.balance_cents).toBe(0);
  });

  it("estimate with materials deposit uses the material basis", () => {
    const materials = estimateMaterialsDepositBasis([
      { line_item_type: "labor", quantity: 1, unit_price_cents: 60000, visible_to_customer: true },
      { line_item_type: "materials", quantity: 2, unit_price_cents: 12500, visible_to_customer: true },
      { line_item_type: "materials", quantity: 1, unit_price_cents: 99999, visible_to_customer: false },
    ]);
    const r = calculateDepositPolicy({ total_cents: 100000, deposit_required: true, deposit_type: "materials", material_total_cents: materials });
    expect(materials).toBe(25000);
    expect(r.deposit_cents).toBe(25000);
    expect(r.balance_cents).toBe(75000);
  });

  it("deposit disabled overrides a stale selected type", () => {
    const r = calculateDepositPolicy({ total_cents: 100000, deposit_required: false, deposit_type: "percentage", deposit_percentage: 30 });
    expect(r.deposit_cents).toBe(0);
    expect(r.deposit_required).toBe(false);
  });

  it("customer estimate copy can label due timing without implying a deposit", () => {
    expect(depositDueTriggerLabel("before_material_order")).toBe("Due before materials are ordered");
  });
});

describe("createApprovalArtifacts deposit policy", () => {
  function fakeClient(estimate: { deposit_required: boolean; deposit_cents: number }) {
    const queries: string[] = [];
    return {
      queries,
      async query(sql: string) {
        queries.push(sql);
        if (sql.includes("FROM estimates")) {
          return { rows: [{ client_id: "client-1", job_id: "job-1", property_id: null, notes: "Scope", ...estimate }], rowCount: 1 };
        }
        if (sql.includes("FROM invoices")) return { rows: [], rowCount: 0 };
        if (sql.includes("INSERT INTO invoices")) return { rows: [{ id: "invoice-1" }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      },
    };
  }

  it("approval with no deposit creates no deposit invoice", async () => {
    const client = fakeClient({ deposit_required: false, deposit_cents: 30000 });
    const result = await createApprovalArtifacts(client as never, { estimateId: "est-1", accountId: "acct-1", userId: "user-1" });
    expect(result.depositInvoiceId).toBeNull();
    expect(client.queries.some((q) => q.includes("INSERT INTO invoices"))).toBe(false);
  });

  it("approval with deposit creates a draft deposit invoice", async () => {
    const client = fakeClient({ deposit_required: true, deposit_cents: 30000 });
    const result = await createApprovalArtifacts(client as never, { estimateId: "est-1", accountId: "acct-1", userId: "user-1" });
    expect(result.depositInvoiceId).toBe("invoice-1");
    expect(client.queries.find((q) => q.includes("INSERT INTO invoices"))).toContain("'draft', 'deposit'");
  });
});

describe("customer estimate deposit copy", () => {
  const base = {
    estimateRef: "EST-1",
    clientName: "Client",
    totalCents: 100000,
    balanceCents: 100000,
    expiresStr: null,
    notes: null,
    approveUrl: "https://example.test/approve",
    declineUrl: "https://example.test/decline",
    viewUrl: "https://example.test/view",
  };

  it("customer estimate copy shows no deposit language when deposit is disabled", () => {
    const html = estimateEmailHtml({ ...base, depositCents: 0 });
    const text = estimateEmailText({ ...base, depositCents: 0 });

    expect(html).not.toContain("Deposit due");
    expect(html).not.toContain("Balance due");
    expect(text).not.toContain("Deposit due");
    expect(text).not.toContain("Balance:");
  });

  it("customer estimate copy shows explicit deposit and balance when selected", () => {
    const html = estimateEmailHtml({ ...base, depositCents: 30000, balanceCents: 70000 });
    const text = estimateEmailText({ ...base, depositCents: 30000, balanceCents: 70000 });

    expect(html).toContain("Deposit due:");
    expect(html).toContain("$300.00");
    expect(html).toContain("Balance due:");
    expect(html).toContain("$700.00");
    expect(text).toContain("Deposit due: $300.00");
    expect(text).toContain("Balance: $700.00");
  });
});
