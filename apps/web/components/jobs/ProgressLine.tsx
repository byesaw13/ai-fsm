import Link from "next/link";
import type { Route } from "next";
import type { ProgressStep } from "@/lib/jobs/progress-line";

/**
 * Call → Estimate → Approved → Working → Invoiced → Paid (TASK-240).
 * Done steps are ticked and open their record; the current step is lit.
 */
export function ProgressLine({ steps, testId = "job-progress-line" }: { steps: ProgressStep[]; testId?: string }) {
  if (steps.length === 0) return null;
  return (
    <ol className="p7-progress-line" data-testid={testId} aria-label="Where this job stands">
      {steps.map((step) => {
        const label = (
          <>
            <span className="p7-progress-line__mark" aria-hidden="true">
              {step.state === "done" ? "✓" : step.state === "current" ? "●" : "○"}
            </span>
            {step.label}
          </>
        );
        return (
          <li
            key={step.key}
            className={`p7-progress-line__step p7-progress-line__step--${step.state}`}
            aria-current={step.state === "current" ? "step" : undefined}
            data-state={step.state}
          >
            {step.href ? <Link href={step.href as Route}>{label}</Link> : <span>{label}</span>}
          </li>
        );
      })}
    </ol>
  );
}
