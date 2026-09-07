/**
 * Phone job-page shortcuts. These used to hash-link to visit repair-flow
 * cards (#visit-issue / #visit-parts / #visit-resolution) that do not exist
 * on standard jobs, so every button landed on the same visit page.
 */
export function mobileJobActionHrefs(args: {
  jobId: string;
  visitId: string | null;
}): {
  scope: string;
  photos: string;
  materials: string;
  notes: string;
  complete: string | null;
} {
  return {
    scope: "#job-scope",
    photos: "#job-photos",
    materials: `/app/jobs/${args.jobId}/materials`,
    notes: "#job-notes",
    complete: args.visitId ? `/app/visits/${args.visitId}` : null,
  };
}
