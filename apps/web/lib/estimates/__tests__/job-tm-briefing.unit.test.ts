import { describe, it, expect } from "vitest";
import { buildJobTmBriefing, tmEstimateHref } from "../job-tm-briefing";

describe("buildJobTmBriefing", () => {
  it("returns empty when only title is present", () => {
    expect(
      buildJobTmBriefing({
        title: "Maynard punch list",
        description: null,
        intake_notes: null,
        property_address: "1 Main St",
        property_city: "Maynard",
        property_state: "MA",
        field_notes: null,
        request_description: null,
        pricing_mode: null,
      })
    ).toBe("");
  });

  it("includes scope, location, T&M flag, and field notes", () => {
    const text = buildJobTmBriefing({
      title: "Maynard punch list",
      description: "Crown, base, patch and paint. HO has wall paint.",
      intake_notes: "Roughly 2 days",
      property_address: "12 Oak St",
      property_city: "Maynard",
      property_state: "MA",
      field_notes: "Ceiling crack in hall needs more coats.",
      request_description: "Customer wants T&M",
      pricing_mode: "hourly_internal",
    });

    expect(text).toContain("Maynard punch list");
    expect(text).toContain("Maynard, MA");
    expect(text).toMatch(/time and materials/i);
    expect(text).toContain("Crown, base");
    expect(text).toContain("Roughly 2 days");
    expect(text).toContain("Ceiling crack");
    expect(text).toContain("Customer wants T&M");
  });
});

describe("tmEstimateHref", () => {
  it("builds mode=tm URL with auto_generate by default", () => {
    const href = tmEstimateHref({
      jobId: "job-1",
      clientId: "client-1",
    });
    expect(href).toContain("mode=tm");
    expect(href).toContain("job_id=job-1");
    expect(href).toContain("client_id=client-1");
    expect(href).toContain("auto_generate=1");
  });

  it("can omit auto_generate", () => {
    const href = tmEstimateHref({ jobId: "job-1", autoGenerate: false });
    expect(href).not.toContain("auto_generate");
  });
});
