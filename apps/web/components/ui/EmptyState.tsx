import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// EmptyState — icon + title + description + optional CTA
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
  "data-testid": testId,
}: EmptyStateProps) {
  return (
    <div
      className={`p7-empty-state ${className}`}
      data-testid={testId}
    >
      {icon && <div className="p7-empty-icon" aria-hidden="true">{icon}</div>}
      <h3 className="p7-empty-title">{title}</h3>
      {description && <p className="p7-empty-desc">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
