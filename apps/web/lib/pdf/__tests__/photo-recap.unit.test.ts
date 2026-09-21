import { describe, expect, it } from "vitest";
import { selectDayPhotoRecap, visitMediaPath } from "../photo-recap";

describe("selectDayPhotoRecap", () => {
  it("puts after photos first and caps at 4", () => {
    const picked = selectDayPhotoRecap([
      { category: "before", visitId: "v1", filename: "b1.jpg", mimeType: "image/jpeg" },
      { category: "after", visitId: "v1", filename: "a1.jpg", mimeType: "image/jpeg" },
      { category: "receipt", visitId: "v1", filename: "r1.jpg", mimeType: "image/jpeg" },
      { category: "after", visitId: "v1", filename: "a2.jpg", mimeType: "image/jpeg" },
      { category: "before", visitId: "v1", filename: "b2.jpg", mimeType: "image/jpeg" },
      { category: "after", visitId: "v1", filename: "a3.jpg", mimeType: "image/jpeg" },
      { category: "after", visitId: "v1", filename: "a4.jpg", mimeType: "image/jpeg" },
    ]);
    expect(picked.map((p) => p.filename)).toEqual(["a1.jpg", "a2.jpg", "a3.jpg", "a4.jpg"]);
  });

  it("fills with before photos when after shots are short", () => {
    const picked = selectDayPhotoRecap([
      { category: "before", visitId: "v1", filename: "b1.jpg", mimeType: "image/jpeg" },
      { category: "after", visitId: "v1", filename: "a1.jpg", mimeType: "image/jpeg" },
    ]);
    expect(picked.map((p) => p.filename)).toEqual(["a1.jpg", "b1.jpg"]);
  });

  it("skips receipts", () => {
    const picked = selectDayPhotoRecap([
      { category: "receipt", visitId: "v1", filename: "hd.jpg", mimeType: "image/jpeg" },
    ]);
    expect(picked).toEqual([]);
  });
});

describe("visitMediaPath", () => {
  it("reads from the visit upload dir", () => {
    expect(visitMediaPath("visit-1", "shot.jpg")).toBe("/app/uploads/visits/visit-1/shot.jpg");
  });
});
