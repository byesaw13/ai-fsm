/**
 * A manual bill attached to a job is the job's money (`final`).
 * A loose bill with no job stays `standard` so it cannot fork a job ledger.
 */
export function manualInvoiceKind(jobId: string | null | undefined): "final" | "standard" {
  return jobId ? "final" : "standard";
}
