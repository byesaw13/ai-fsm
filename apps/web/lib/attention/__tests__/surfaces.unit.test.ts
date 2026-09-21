import { describe, expect, it } from "vitest";
import {
  ATTENTION_TODAY_LABELS,
  ATTENTION_DESK_LABELS,
  HOLD_SEND_BILL_LABEL,
  attentionSurfaceForLabel,
  filterAttentionForSurface,
} from "../surfaces";

describe("Needs Attention surfaces", () => {
  it("puts field leftovers on Today and money/office leaks on Desk", () => {
    for (const label of ATTENTION_TODAY_LABELS) {
      expect(attentionSurfaceForLabel(label)).toBe("today");
    }
    for (const label of ATTENTION_DESK_LABELS) {
      expect(attentionSurfaceForLabel(label)).toBe("desk");
    }
  });

  it("does not list the same bucket on both surfaces", () => {
    const overlap = ATTENTION_TODAY_LABELS.filter((l) =>
      (ATTENTION_DESK_LABELS as readonly string[]).includes(l),
    );
    expect(overlap).toEqual([]);
  });

  it("makes unsent Hold the first Today leftover, louder than Finished, no invoice", () => {
    expect(HOLD_SEND_BILL_LABEL).toBe("Hold — send the bill");
    expect(ATTENTION_TODAY_LABELS[0]).toBe(HOLD_SEND_BILL_LABEL);
    expect(ATTENTION_TODAY_LABELS as readonly string[]).not.toContain("Finished, no invoice");
  });

  it("filters a mixed list to one surface and keeps Hold first", () => {
    const items = [
      { label: "Receipts not on a job", count: 3 },
      { label: "Draft bills", count: 2 },
      { label: HOLD_SEND_BILL_LABEL, count: 1 },
      { label: "Follow up quotes", count: 4 },
    ];
    expect(filterAttentionForSurface(items, "today").map((i) => i.label)).toEqual([
      HOLD_SEND_BILL_LABEL,
      "Receipts not on a job",
    ]);
    expect(filterAttentionForSurface(items, "desk").map((i) => i.label)).toEqual([
      "Draft bills",
      "Follow up quotes",
    ]);
  });

  it("keeps customer promises on the desk", () => {
    expect(attentionSurfaceForLabel("Customer Promises")).toBe("desk");
  });
});
