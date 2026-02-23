import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

// ---------------------------------------------------------------------------
// PageHeader — title + subtitle + right slot for primary CTA
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  actions,
  children,
}: PageHeaderProps) {
  return (
    <div className="p7-page-header page-header">
      <div className="p7-page-header-left">
        {backHref && (
          <Link href={backHref as Route} className="p7-back-link back-link">
            ← {backLabel}
          </Link>
        )}
        <h1 className="p7-page-title page-title">{title}</h1>
        {subtitle && <p className="p7-page-subtitle page-subtitle">{subtitle}</p>}
        {children}
      </div>
      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
