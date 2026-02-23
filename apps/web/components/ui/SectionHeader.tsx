import type { ReactNode } from "react";
import { CountBadge } from "./Badge";

// ---------------------------------------------------------------------------
// SectionHeader — section title + optional count badge + optional action
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string;
  count?: number;
  action?: ReactNode;
  as?: "h2" | "h3" | "h4";
}

export function SectionHeader({
  title,
  count,
  action,
  as: Tag = "h2",
}: SectionHeaderProps) {
  return (
    <div className="p7-section-header">
      <Tag className="p7-section-title">
        {title}
        {count !== undefined && <CountBadge count={count} />}
      </Tag>
      {action && <div>{action}</div>}
    </div>
  );
}
