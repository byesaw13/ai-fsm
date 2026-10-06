import { describe, expect, it } from "vitest";
import { cleanRecords, prefillSummary, resolveRecipient, vaultItemsFromRecords } from "../logic";

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

describe("vaultItemsFromRecords (TASK-175)", () => {
  it("keeps a valid vault tag through cleanRecords and drops an unknown one", () => {
    expect(cleanRecords([{ label: "Door", detail: "Hale Navy", vault_category: "paint_finish" }]))
      .toEqual([{ label: "Door", detail: "Hale Navy", vault_category: "paint_finish" }]);
    expect(cleanRecords([{ label: "Door", detail: "Hale Navy", vault_category: "bogus" as never }]))
      .toEqual([{ label: "Door", detail: "Hale Navy" }]);
  });

  it("maps only tagged lines; label names the item, detail is the note", () => {
    expect(vaultItemsFromRecords([
      { label: "Door color", detail: "BM Hale Navy HC-154", vault_category: "paint_finish" },
      { label: "", detail: "Furnace filter 16x25x1 MERV 11", vault_category: "filter" },
      { label: "Caulk", detail: "DAP Dynaflex" },
    ])).toEqual([
      { category: "paint_finish", name: "Door color", notes: "BM Hale Navy HC-154" },
      { category: "filter", name: "Furnace filter 16x25x1 MERV 11", notes: null },
    ]);
  });

  it("collapses duplicate lines", () => {
    const line = { label: "Trim", detail: "Simply White", vault_category: "paint_finish" as const };
    expect(vaultItemsFromRecords([line, { ...line, label: "trim" }])).toHaveLength(1);
  });
});
