import { describe, expect, it } from "vitest";
import { spokenCloseoutBody } from "../spoken-closeout";

describe("spokenCloseoutBody", () => {
  it("refuses an empty note", () => {
    expect(spokenCloseoutBody({ kind: "done", note: "  ", nextWhen: "tomorrow", nextDate: "" }).ok).toBe(false);
  });

  it("uses the one sentence as the note and as what's first", () => {
    const result = spokenCloseoutBody({
      kind: "return",
      note: " Closet doors still in the truck ",
      nextWhen: "tomorrow",
      nextDate: "",
    });
    expect(result).toEqual({
      ok: true,
      body: {
        kind: "return",
        today_notes: "Closet doors still in the truck",
        first_up: "Closet doors still in the truck",
        next_when: "tomorrow",
      },
    });
  });

  it("does not add a second line when the job is done", () => {
    const result = spokenCloseoutBody({
      kind: "done",
      note: "Hung the door",
      nextWhen: "tomorrow",
      nextDate: "",
      sendBill: true,
      canSend: false,
    });
    expect(result.ok && result.body).toEqual({
      kind: "done",
      today_notes: "Hung the door",
      send_invoice: false,
    });
  });
});
