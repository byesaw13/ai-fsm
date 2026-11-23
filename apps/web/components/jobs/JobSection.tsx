import type { ReactNode } from "react";

/**
 * One of the job page's three sections — Work, Money, History (TASK-239).
 * A native <details>, closed unless `defaultOpen`; OpenSectionForHash opens it
 * when a link jumps to something inside.
 */
export function JobSection({
  title,
  hint,
  testId,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint: string;
  testId: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="p7-job-section" data-testid={testId} open={defaultOpen}>
      <summary className="p7-job-section__summary">
        <span className="p7-job-section__title">{title}</span>
        <span className="p7-job-section__hint">{hint}</span>
      </summary>
      <div className="p7-job-section__body">{children}</div>
    </details>
  );
}
