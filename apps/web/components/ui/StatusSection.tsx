import type { ReactNode } from "react";
import { CountBadge } from "./Badge";

// ---------------------------------------------------------------------------
// StatusSection — collapsible status group with count badge
// ---------------------------------------------------------------------------

interface StatusSectionProps {
  title: string;
  count?: number;
  children: ReactNode;
  className?: string;
  /** If true, section is hidden when count is 0 and no children */
  hideWhenEmpty?: boolean;
}

export function StatusSection({
  title,
  count,
  children,
  className = "",
  hideWhenEmpty = false,
}: StatusSectionProps) {
  if (hideWhenEmpty && count === 0) return null;

  return (
    <div className={`p7-status-section ${className}`}>
      <div className="p7-status-section-header">
        <span>{title}</span>
        {count !== undefined && <CountBadge count={count} />}
      </div>
      <div className="p7-status-section-items">{children}</div>
    </div>
  );
}
