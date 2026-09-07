import { describe, expect, it } from "vitest";
import { mobileJobActionHrefs } from "../mobile-job-actions";

describe("mobileJobActionHrefs", () => {
  it("points Scope, Photos, and Notes at job-page sections — not the visit", () => {
    const hrefs = mobileJobActionHrefs({ jobId: "job-1", visitId: "visit-1" });
    expect(hrefs.scope).toBe("#job-scope");
    expect(hrefs.photos).toBe("#job-photos");
    expect(hrefs.notes).toBe("#job-notes");
  });

  it("opens the job materials page, not visit parts", () => {
    const hrefs = mobileJobActionHrefs({ jobId: "job-1", visitId: "visit-1" });
    expect(hrefs.materials).toBe("/app/jobs/job-1/materials");
  });

  it("keeps Complete Visit on the visit when one exists", () => {
    expect(mobileJobActionHrefs({ jobId: "job-1", visitId: "visit-1" }).complete).toBe(
      "/app/visits/visit-1",
    );
    expect(mobileJobActionHrefs({ jobId: "job-1", visitId: null }).complete).toBeNull();
  });
});
