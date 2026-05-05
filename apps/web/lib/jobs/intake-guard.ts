export interface JobIntakeGuardResult {
  status: "passed" | "blocked" | "warning";
  blocker: string | null;
  warning: string | null;
}

export function reviewJobIntakeGate(job: {
  intake_decision: string | null;
}): JobIntakeGuardResult {
  if (job.intake_decision === "decline") {
    return {
      status: "blocked",
      blocker:
        "This job has been declined. Update the intake decision before advancing.",
      warning: null,
    };
  }
  if (!job.intake_decision) {
    return {
      status: "warning",
      blocker: null,
      warning:
        "No intake decision recorded. Complete the Job Intake panel to confirm this work fits the pipeline.",
    };
  }
  return { status: "passed", blocker: null, warning: null };
}
