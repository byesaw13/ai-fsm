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
  /** Use a paragraph when the page already has its own h1. */
  titleAs?: "h1" | "p";
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  actions,
  children,
  titleAs = "h1",
}: PageHeaderProps) {
  const titleClass = "p7-page-title page-title";
  return (
    <div className="p7-page-header page-header">
      <div className="p7-page-header-left">
        {backHref && (
          <Link href={backHref as Route} className="p7-back-link back-link">
            ← {backLabel}
          </Link>
        )}
        {titleAs === "p" ? (
          <p className={titleClass}>{title}</p>
        ) : (
          <h1 className={titleClass}>{title}</h1>
        )}
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
