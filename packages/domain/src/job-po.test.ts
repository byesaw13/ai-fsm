import { describe, it, expect } from "vitest";
import {
  parseJobNumber,
  toSupplyPo,
  toCanonicalJobNumber,
  extractSupplyPoCandidates,
  matchJobsBySupplyPo,
  formatJobPickerLabel,
} from "./job-po";

describe("parseJobNumber / toSupplyPo", () => {
  it("parses canonical J-YYYY-####", () => {
    const p = parseJobNumber("J-2026-0029");
    expect(p).toEqual({
      year: 2026,
      seq: 29,
      canonical: "J-2026-0029",
      supplyPo: "J260029",
    });
    expect(toSupplyPo("J-2026-0029")).toBe("J260029");
  });

  it("parses supply form JYY####", () => {
    expect(toSupplyPo("J260029")).toBe("J260029");
    expect(toCanonicalJobNumber("J260029")).toBe("J-2026-0029");
  });

  it("pads short sequence in canonical form", () => {
    expect(parseJobNumber("J-2026-29")?.canonical).toBe("J-2026-0029");
    expect(toSupplyPo("J-2026-29")).toBe("J260029");
  });

  it("is case-insensitive and trims", () => {
    expect(toSupplyPo("  j-2026-0029  ")).toBe("J260029");
  });

  it("returns null for empty / garbage", () => {
    expect(toSupplyPo(null)).toBeNull();
    expect(toSupplyPo("")).toBeNull();
    expect(toSupplyPo("SWIFT LANE")).toBeNull();
    expect(toSupplyPo("260029")).toBeNull(); // no J prefix
  });
});

describe("extractSupplyPoCandidates", () => {
  it("finds PO-marked tokens", () => {
    expect(extractSupplyPoCandidates("Materials PO J260029 lumber")).toEqual(["J260029"]);
    expect(extractSupplyPoCandidates("P.O. #J-2026-0029")).toEqual(["J260029"]);
  });

  it("finds bare job numbers", () => {
    expect(extractSupplyPoCandidates("Job J-2026-0042 hardware")).toEqual(["J260042"]);
    expect(extractSupplyPoCandidates("ref J260042")).toEqual(["J260042"]);
  });

  it("finds spoken whitespace form J 26 0029", () => {
    expect(extractSupplyPoCandidates("PO J 26 0029 lumber")).toEqual(["J260029"]);
    expect(extractSupplyPoCandidates("ref J 26 0029")).toEqual(["J260029"]);
  });

  it("dedupes equivalent forms", () => {
    expect(extractSupplyPoCandidates("PO J260029 and J-2026-0029")).toEqual(["J260029"]);
  });

  it("returns empty when none", () => {
    expect(extractSupplyPoCandidates("screws and glue")).toEqual([]);
    expect(extractSupplyPoCandidates(null)).toEqual([]);
  });
});

describe("matchJobsBySupplyPo", () => {
  const jobs = [
    { id: "a", job_number: "J-2026-0029" },
    { id: "b", job_number: "J-2026-0042" },
    { id: "c", job_number: null },
  ];

  it("matches unique supply PO", () => {
    expect(matchJobsBySupplyPo("PO J260029", jobs)).toEqual({
      jobId: "a",
      jobNumber: "J-2026-0029",
      supplyPo: "J260029",
      confidence: "exact",
    });
  });

  it("matches full job number form", () => {
    expect(matchJobsBySupplyPo("J-2026-0042", jobs)?.jobId).toBe("b");
  });

  it("returns null when no candidate", () => {
    expect(matchJobsBySupplyPo("no po here", jobs)).toBeNull();
  });

  it("returns null when candidate matches no open job", () => {
    expect(matchJobsBySupplyPo("PO J269999", jobs)).toBeNull();
  });

  it("returns null when two different POs match two jobs (ambiguous)", () => {
    expect(matchJobsBySupplyPo("J260029 and also J260042", jobs)).toBeNull();
  });
});

describe("formatJobPickerLabel", () => {
  it("prefixes supply PO", () => {
    expect(formatJobPickerLabel("Front door", "J-2026-0029")).toBe("J260029 · Front door");
  });

  it("falls back to title", () => {
    expect(formatJobPickerLabel("Front door", null)).toBe("Front door");
  });
});
