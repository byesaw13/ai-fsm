import { describe, expect, it } from "vitest";
import {
  estimateAttentionPredicate,
  formatBadgeCount,
  invoiceAttentionPredicate,
  ESTIMATE_ATTENTION_WHERE,
  INVOICE_ATTENTION_WHERE,
} from "../counts";

describe("formatBadgeCount", () => {
  it("hides zero", () => {
    expect(formatBadgeCount(0)).toBeNull();
  });

  it("shows small integers", () => {
    expect(formatBadgeCount(1)).toBe("1");
    expect(formatBadgeCount(42)).toBe("42");
  });

  it("caps at 99+", () => {
    expect(formatBadgeCount(99)).toBe("99");
    expect(formatBadgeCount(100)).toBe("99+");
    expect(formatBadgeCount(500)).toBe("99+");
  });
});

describe("invoiceAttentionPredicate", () => {
  it("includes draft final/standard, overdue, and unopened sent/partial", () => {
    const sql = invoiceAttentionPredicate();
    expect(sql).toContain("status != 'void'");
    expect(sql).toContain("invoice_kind IN ('final', 'standard')");
    expect(sql).toContain("status = 'overdue'");
    expect(sql).toContain("status IN ('sent', 'partial')");
    expect(sql).toContain("first_viewed_at IS NULL");
  });

  it("prefixes columns when alias is provided", () => {
    const sql = invoiceAttentionPredicate("i");
    expect(sql).toContain("i.status != 'void'");
    expect(sql).toContain("i.invoice_kind");
    expect(sql).toContain("i.first_viewed_at");
    // bare column form should not appear when aliased
    expect(sql.includes(" status != 'void'")).toBe(false);
  });

  it("matches count WHERE helper shape", () => {
    expect(INVOICE_ATTENTION_WHERE).toContain("account_id = $1");
    expect(INVOICE_ATTENTION_WHERE).toContain("status != 'void'");
  });
});

describe("estimateAttentionPredicate", () => {
  it("requires sent and non-expired", () => {
    const sql = estimateAttentionPredicate();
    expect(sql).toContain("status = 'sent'");
    expect(sql).toContain("expires_at IS NULL OR expires_at >= CURRENT_DATE");
  });

  it("prefixes columns when alias is provided", () => {
    const sql = estimateAttentionPredicate("e");
    expect(sql).toContain("e.status = 'sent'");
    expect(sql).toContain("e.expires_at");
  });

  it("matches count WHERE helper shape", () => {
    expect(ESTIMATE_ATTENTION_WHERE).toContain("account_id = $1");
    expect(ESTIMATE_ATTENTION_WHERE).toContain("status = 'sent'");
  });
});
