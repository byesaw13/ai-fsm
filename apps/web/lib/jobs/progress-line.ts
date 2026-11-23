/**
 * The job's place in the flow as one line (TASK-240):
 * Call → Estimate → Approved → Working → Invoiced → Paid.
 * Built from records that already exist; no new columns. Pure, so every
 * combination is unit-tested.
 */

export type JobProgressInput = {
  jobStatus: string;
  requestId: string | null;
  /** Latest estimate on the job, any status. */
  estimateId: string | null;
  estimateSent: boolean;
  approvedEstimateId: string | null;
  /** Latest final/standard invoice (not deposits, not void). */
  invoiceId: string | null;
  invoiceStatus: string | null;
};

export type ProgressStepState = "done" | "current" | "todo";

export type ProgressStep = {
  key: "call" | "estimate" | "approved" | "working" | "invoiced" | "paid";
  label: string;
  state: ProgressStepState;
  /** A finished step opens its record. */
  href?: string;
};

const WORK_DONE = new Set(["completed", "invoiced"]);
const INVOICE_OUT = new Set(["sent", "partial", "paid", "overdue"]);

export function jobProgressSteps(i: JobProgressInput): ProgressStep[] {
  if (i.jobStatus === "cancelled") return [];

  const hasEstimate = !!(i.estimateId || i.approvedEstimateId);
  // A quick job (started without an estimate) never had those two steps.
  const quick = !hasEstimate && !["draft", "quoted"].includes(i.jobStatus);

  const raw: Array<Omit<ProgressStep, "state"> & { done: boolean }> = [
    { key: "call", label: "Call", done: true, href: i.requestId ? `/app/requests/${i.requestId}` : undefined },
  ];
  if (!quick) {
    raw.push(
      {
        key: "estimate",
        label: "Estimate",
        done: i.estimateSent,
        href: i.estimateId ? `/app/estimates/${i.estimateId}` : undefined,
      },
      {
        key: "approved",
        label: "Approved",
        done: !!i.approvedEstimateId,
        href: i.approvedEstimateId ? `/app/estimates/${i.approvedEstimateId}` : undefined,
      },
    );
  }
  raw.push(
    // A draft invoice can be prepared early from an approved estimate; only an
    // invoice that went out says the work is done.
    { key: "working", label: "Working", done: WORK_DONE.has(i.jobStatus) || INVOICE_OUT.has(i.invoiceStatus ?? "") },
    {
      key: "invoiced",
      label: "Invoiced",
      done: !!i.invoiceId && INVOICE_OUT.has(i.invoiceStatus ?? ""),
      href: i.invoiceId ? `/app/invoices/${i.invoiceId}` : undefined,
    },
    { key: "paid", label: "Paid", done: i.invoiceStatus === "paid" },
  );

  // A later step being done means the earlier ones are done too.
  const lastDone = raw.map((s) => s.done).lastIndexOf(true);
  let currentSet = false;
  return raw.map((s, idx) => {
    const done = idx <= lastDone;
    let state: ProgressStepState = done ? "done" : "todo";
    if (!done && !currentSet) {
      state = "current";
      currentSet = true;
    }
    return { key: s.key, label: s.label, state, href: done ? s.href : undefined };
  });
}
