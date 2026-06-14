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
} from "../assessment-context";

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
