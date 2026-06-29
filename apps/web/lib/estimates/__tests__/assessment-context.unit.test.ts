/**
 * Unit tests for the assessment → estimate sessionStorage hand-off.
 *
 * Runs in the node test environment, so window/sessionStorage are stubbed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ASSESSMENT_CONTEXT_KEY,
  normalizeAssessmentRooms,
  writeAssessmentContext,
  readAssessmentContext,
  clearAssessmentContext,
  consumeAssessmentContext,
  resolveAssessmentContext,
  preserveScope,
  type AssessmentContext,
} from "../assessment-context";

const ctx = (desc: string): AssessmentContext => ({
  generatedJobDescription: desc,
  rooms: [],
  visitId: "v1",
  assessmentId: "a1",
});

describe("resolveAssessmentContext (persisted recovery — TASK-018 slice 2)", () => {
  it("uses the sessionStorage context when present (server fallback ignored)", () => {
    const read = vi.fn(() => ctx("from-storage"));
    const clear = vi.fn();
    const out = resolveAssessmentContext(true, ctx("from-server"), { read, clear });
    expect(out?.generatedJobDescription).toBe("from-storage");
    expect(clear).toHaveBeenCalledOnce();
  });

  it("recovers from the server context when sessionStorage is missing (refresh/deep-link)", () => {
    const read = vi.fn(() => null);
    const clear = vi.fn();
    const out = resolveAssessmentContext(true, ctx("from-server"), { read, clear });
    expect(out?.generatedJobDescription).toBe("from-server");
    expect(clear).toHaveBeenCalledOnce();
  });

  it("returns null and still clears when not opened from an assessment", () => {
    const read = vi.fn(() => ctx("from-storage"));
    const clear = vi.fn();
    const out = resolveAssessmentContext(false, ctx("from-server"), { read, clear });
    expect(out).toBeNull();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("returns null when neither source has context", () => {
    expect(
      resolveAssessmentContext(true, null, { read: () => null, clear: () => {} })
    ).toBeNull();
  });
});

describe("preserveScope (manual-edit preservation)", () => {
  it("keeps the owner's typed text once the field is dirty", () => {
    expect(preserveScope("owner edit", "fresh default", true)).toBe("owner edit");
  });
  it("adopts the incoming default while the field is untouched", () => {
    expect(preserveScope("", "fresh default", false)).toBe("fresh default");
  });
});

function makeSessionStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    _store: store,
  };
}

describe("normalizeAssessmentRooms", () => {
  it("coerces arbitrary room objects to the MaterialsGenerator shape", () => {
    const out = normalizeAssessmentRooms([
      { id: "1", name: "Kitchen", length_ft: 10, width_ft: 12, height_ft: 8, notes: "tile" },
      { id: "2", name: "Hall", length_ft: 4, width_ft: 10 }, // missing height/notes
    ]);
    expect(out).toEqual([
      { id: "1", name: "Kitchen", length_ft: 10, width_ft: 12, height_ft: 8, notes: "tile" },
      { id: "2", name: "Hall", length_ft: 4, width_ft: 10, height_ft: null, notes: "" },
    ]);
  });

  it("defaults non-finite / wrong-typed dimensions to null and missing strings to ''", () => {
    const out = normalizeAssessmentRooms([
      { id: 5, name: 42, length_ft: "10", width_ft: NaN, height_ft: undefined, notes: null },
    ]);
    expect(out).toEqual([
      { id: "", name: "", length_ft: null, width_ft: null, height_ft: null, notes: "" },
    ]);
  });

  it("returns [] for non-array input", () => {
    expect(normalizeAssessmentRooms(null)).toEqual([]);
    expect(normalizeAssessmentRooms(undefined)).toEqual([]);
    expect(normalizeAssessmentRooms("nope" as unknown)).toEqual([]);
  });
});

describe("write / read assessment context (browser env)", () => {
  let storage: ReturnType<typeof makeSessionStorage>;

  beforeEach(() => {
    storage = makeSessionStorage();
    vi.stubGlobal("window", {} as unknown);
    vi.stubGlobal("sessionStorage", storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips the generated description, rooms, and ids", () => {
    writeAssessmentContext({
      generatedJobDescription: "Repaint first floor.\n\nRooms / areas:\n- Kitchen",
      rooms: [{ id: "1", name: "Kitchen", length_ft: 10, width_ft: 12, height_ft: 8, notes: "tile" }],
      visitId: "visit-1",
      assessmentId: "assess-1",
    });

    const ctx = readAssessmentContext();
    expect(ctx).toEqual({
      generatedJobDescription: "Repaint first floor.\n\nRooms / areas:\n- Kitchen",
      rooms: [{ id: "1", name: "Kitchen", length_ft: 10, width_ft: 12, height_ft: 8, notes: "tile" }],
      visitId: "visit-1",
      assessmentId: "assess-1",
    });
  });

  it("normalizes rooms on write so the stored payload matches the generator shape", () => {
    writeAssessmentContext({
      generatedJobDescription: "x",
      rooms: [{ id: "1", name: "Hall", length_ft: 4, width_ft: 10 } as never],
    });
    const stored = JSON.parse(storage._store.get(ASSESSMENT_CONTEXT_KEY)!);
    expect(stored.rooms[0]).toEqual({
      id: "1",
      name: "Hall",
      length_ft: 4,
      width_ft: 10,
      height_ft: null,
      notes: "",
    });
  });

  it("uses the documented key name", () => {
    writeAssessmentContext({ generatedJobDescription: "x", rooms: [] });
    expect(storage._store.has("dovetails.assessmentContext")).toBe(true);
  });

  it("returns null when no context is stored", () => {
    expect(readAssessmentContext()).toBeNull();
  });

  it("returns null on malformed JSON rather than throwing", () => {
    storage.setItem(ASSESSMENT_CONTEXT_KEY, "{not json");
    expect(readAssessmentContext()).toBeNull();
  });

  it("defaults missing fields when reading partial context", () => {
    storage.setItem(ASSESSMENT_CONTEXT_KEY, JSON.stringify({ generatedJobDescription: "only desc" }));
    expect(readAssessmentContext()).toEqual({
      generatedJobDescription: "only desc",
      rooms: [],
      visitId: null,
      assessmentId: null,
    });
  });

  it("clears stored context", () => {
    writeAssessmentContext({ generatedJobDescription: "x", rooms: [] });
    clearAssessmentContext();
    expect(readAssessmentContext()).toBeNull();
  });
});

describe("consumeAssessmentContext (hand-off gating)", () => {
  const ctx: AssessmentContext = {
    generatedJobDescription: "Repaint kitchen",
    rooms: [{ id: "1", name: "Kitchen", length_ft: 10, width_ft: 12, height_ft: 8, notes: "" }],
    visitId: "visit-1",
    assessmentId: "assess-1",
  };

  it("returns the context and clears storage when opened from an assessment", () => {
    const clear = vi.fn();
    const out = consumeAssessmentContext(true, { read: () => ctx, clear });
    expect(out).toEqual(ctx);
    expect(clear).toHaveBeenCalledOnce();
  });

  it("drops stale context (returns null) but still clears when NOT from an assessment", () => {
    const clear = vi.fn();
    // Storage held leftover context from an abandoned hand-off; a plain new
    // estimate must not inherit it.
    const out = consumeAssessmentContext(false, { read: () => ctx, clear });
    expect(out).toBeNull();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("always clears even when there was nothing stored", () => {
    const clear = vi.fn();
    const out = consumeAssessmentContext(true, { read: () => null, clear });
    expect(out).toBeNull();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("integrates with the real read/clear via sessionStorage", () => {
    const storage = makeSessionStorage();
    vi.stubGlobal("window", {} as unknown);
    vi.stubGlobal("sessionStorage", storage);
    try {
      writeAssessmentContext(ctx);
      const out = consumeAssessmentContext(true);
      expect(out?.generatedJobDescription).toBe("Repaint kitchen");
      // Consumed: a second read finds nothing.
      expect(readAssessmentContext()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("server environment (no window)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", undefined as unknown);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("read is a no-op returning null", () => {
    expect(readAssessmentContext()).toBeNull();
  });

  it("write does not throw", () => {
    expect(() => writeAssessmentContext({ generatedJobDescription: "x", rooms: [] })).not.toThrow();
  });
});
