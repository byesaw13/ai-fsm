/**
 * Assemble a T&M estimate briefing from job-scoped records.
 * Used by job detail "use this briefing" and estimate new-page prefill.
 */

export const TM_BRIEFING_STORAGE_KEY = "estimate_tm_briefing_prefill";

export interface JobTmBriefingSource {
  title: string;
  description: string | null;
  intake_notes: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  /** Latest visit tech notes, assessment notes, etc. */
  field_notes: string | null;
  /** Booking request / intake service description */
  request_description: string | null;
  pricing_mode: "flat_rate" | "hourly_internal" | null;
}

/**
 * Build freeform briefing text from available job context.
 * Returns empty string when nothing useful is available.
 */
export function buildJobTmBriefing(source: JobTmBriefingSource): string {
  const sections: string[] = [];

  sections.push(`Job: ${source.title.trim() || "Untitled project"}`);

  const locationParts = [
    source.property_address?.trim(),
    source.property_city?.trim(),
    source.property_state?.trim(),
  ].filter(Boolean);
  if (locationParts.length > 0) {
    sections.push(`Location: ${locationParts.join(", ")}`);
  }

  if (source.pricing_mode === "hourly_internal") {
    sections.push(
      "Pricing mode: time and materials (T&M). Estimate expected hours and materials at cost — not a fixed bid."
    );
  }

  if (source.description?.trim()) {
    sections.push(`Scope / description:\n${source.description.trim()}`);
  }

  if (source.request_description?.trim()) {
    sections.push(`Request notes:\n${source.request_description.trim()}`);
  }

  if (source.intake_notes?.trim()) {
    sections.push(`Intake notes:\n${source.intake_notes.trim()}`);
  }

  if (source.field_notes?.trim()) {
    sections.push(`Field / walkthrough notes:\n${source.field_notes.trim()}`);
  }

  // Only title (+ empty optional) is not enough to generate
  const hasBody =
    Boolean(source.description?.trim()) ||
    Boolean(source.request_description?.trim()) ||
    Boolean(source.intake_notes?.trim()) ||
    Boolean(source.field_notes?.trim());

  if (!hasBody) return "";

  return sections.join("\n\n");
}

export function tmEstimateHref(params: {
  jobId: string;
  clientId?: string | null;
  autoGenerate?: boolean;
}): string {
  const q = new URLSearchParams();
  q.set("mode", "tm");
  q.set("job_id", params.jobId);
  if (params.clientId) q.set("client_id", params.clientId);
  if (params.autoGenerate !== false) q.set("auto_generate", "1");
  return `/app/estimates/new?${q.toString()}`;
}
