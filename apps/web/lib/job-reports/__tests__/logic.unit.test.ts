import { describe, expect, it } from "vitest";
import { cleanRecords, prefillSummary, resolveRecipient } from "../logic";

const inv = (client_id: string, status = "sent", billing_context = "standard") => ({ client_id, status, billing_context });

describe("resolveRecipient", () => {
  it("needs a billed invoice", () => {
    expect(resolveRecipient([]).ok).toBe(false);
    expect(resolveRecipient([inv("a", "draft"), inv("a", "void")]).ok).toBe(false);
  });
  it("goes to the one payer, ignoring drafts and voids", () => {
    expect(resolveRecipient([inv("a", "paid"), inv("b", "void"), inv("c", "draft")])).toEqual({
      ok: true, clientId: "a", sponsored: false,
    });
  });
  it("blocks mixed payers", () => {
    expect(resolveRecipient([inv("a"), inv("b", "paid")]).ok).toBe(false);
  });
  it("flags a sponsoring realtor", () => {
    expect(resolveRecipient([inv("kim", "paid", "realtor_sponsored")])).toEqual({ ok: true, clientId: "kim", sponsored: true });
  });
});

describe("prefillSummary", () => {
  it("prefers the invoice work summary", () => {
    expect(prefillSummary({ workSummaries: [null, "  Kitchen light replacement "], laborLines: ["x"] }))
      .toBe("Kitchen light replacement");
  });
  it("skips generic line names and intake auto-titles", () => {
    expect(prefillSummary({ workSummaries: [], laborLines: ["Labor", "Travel (T&M) — 2.0 hr"], jobTitle: "Finish porches" }))
      .toBe("Finish porches");
    expect(prefillSummary({ workSummaries: [], laborLines: ["Labor"], jobTitle: "General Repairs - Brian Floss", clientName: "Brian Floss" }))
      .toBe("");
  });

  it("falls back to labor lines as bullets, then blank", () => {
    expect(prefillSummary({ workSummaries: [null], laborLines: ["Patch drywall", " "] })).toBe("• Patch drywall");
    expect(prefillSummary({ workSummaries: [], laborLines: [] })).toBe("");
  });
});

describe("cleanRecords", () => {
  it("trims, drops blank rows, caps count", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `L${i}`, detail: "d" }));
    expect(cleanRecords([{ label: " Hall ", detail: " BM White Dove " }, { label: " ", detail: "" }]))
      .toEqual([{ label: "Hall", detail: "BM White Dove" }]);
    expect(cleanRecords(many)).toHaveLength(30);
  });
});
