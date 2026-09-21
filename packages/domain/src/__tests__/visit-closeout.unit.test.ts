import { describe, expect, it } from "vitest";
import {
  isDumpExpense,
  laborDescriptionFromVisitNotes,
  visitCloseoutBodySchema,
} from "../visit-closeout";

describe("isDumpExpense", () => {
  it("matches Derry transfer station notes", () => {
    expect(
      isDumpExpense({
        vendor_name: "Town of Derry",
        notes: "Derry transfer station drop-off: demo debris",
        category: "other",
      }),
    ).toBe(true);
  });

  it("does not match ordinary Home Depot materials", () => {
    expect(
      isDumpExpense({
        vendor_name: "The Home Depot",
        notes: "KILZ primer",
        category: "materials",
      }),
    ).toBe(false);
  });
});

describe("laborDescriptionFromVisitNotes", () => {
  it("stacks notes oldest first", () => {
    expect(
      laborDescriptionFromVisitNotes(
        ["Replaced garage door panels.", "Paint prep.", "Painted bedroom."],
        "Labor",
      ),
    ).toBe("Replaced garage door panels.\nPaint prep.\nPainted bedroom.");
  });

  it("falls back when empty", () => {
    expect(laborDescriptionFromVisitNotes(["", null], "Assemble Bed")).toBe("Assemble Bed");
  });
});

describe("visitCloseoutBodySchema", () => {
  it("requires notes", () => {
    const parsed = visitCloseoutBodySchema.safeParse({ kind: "done", today_notes: "  " });
    expect(parsed.success).toBe(false);
  });

  it("accepts done with notes", () => {
    const parsed = visitCloseoutBodySchema.safeParse({
      kind: "done",
      today_notes: "Assembled the bed",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts Hold vs Send on done", () => {
    expect(
      visitCloseoutBodySchema.safeParse({
        kind: "done",
        today_notes: "Assembled the bed",
        send_invoice: false,
      }).success,
    ).toBe(true);
    expect(
      visitCloseoutBodySchema.safeParse({
        kind: "done",
        today_notes: "Assembled the bed",
        send_invoice: true,
      }).success,
    ).toBe(true);
  });

  it("requires next_when and first_up on return", () => {
    const parsed = visitCloseoutBodySchema.safeParse({
      kind: "return",
      today_notes: "Paint prep",
    });
    expect(parsed.success).toBe(false);
  });
});
