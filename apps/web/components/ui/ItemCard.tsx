import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

// ---------------------------------------------------------------------------
// ItemCard — unified card-style list item (jobs, visits, estimates, invoices)
// ---------------------------------------------------------------------------

interface ItemCardProps {
  href?: string;
  title: string;
  titleBadge?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  overdue?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function ItemCard({
  href,
  title,
  titleBadge,
  meta,
  actions,
  overdue = false,
  className = "",
  "data-testid": testId,
}: ItemCardProps) {
  const cardClass = [
    "p7-item-card",
    overdue ? "p7-item-card-overdue" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <div className="p7-item-card-header">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
          <span className="p7-item-title">{title}</span>
          {titleBadge}
        </div>
        {actions && (
          <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>
      {meta && <div className="p7-item-meta">{meta}</div>}
    </>
  );

  if (href) {
    return (
      <Link href={href as Route} className={cardClass} data-testid={testId}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={cardClass} data-testid={testId}>
      {inner}
    </div>
  );
}
