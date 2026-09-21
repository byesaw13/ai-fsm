import { describe, expect, it } from "vitest";
import {
  ATTENTION_TODAY_LABELS,
  ATTENTION_DESK_LABELS,
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

  it("filters a mixed list to one surface", () => {
    const items = [
      { label: "Finished, no invoice", count: 1 },
      { label: "Draft bills", count: 2 },
      { label: "Receipts not on a job", count: 3 },
      { label: "Follow up quotes", count: 4 },
    ];
    expect(filterAttentionForSurface(items, "today").map((i) => i.label)).toEqual([
      "Finished, no invoice",
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
