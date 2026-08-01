import Link from "next/link";
import type { Route } from "next";

export type Crumb = {
  /** Omit href on the current page (last crumb). */
  href?: string;
  label: string;
};

/**
 * Nested trail for T2 entity pages.
 * Canonical product nest: Client → Property → Job → Work order → Visit.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  // On narrow trails keep all crumbs; long trails keep first + last two.
  const display =
    items.length <= 3
      ? items
      : [items[0], { label: "…", href: undefined }, ...items.slice(-2)];

  return (
    <nav className="p7-breadcrumbs" aria-label="Breadcrumb">
      <ol className="p7-breadcrumbs-list">
        {display.map((crumb, i) => {
          const isLast = i === display.length - 1;
          const isEllipsis = crumb.label === "…" && !crumb.href;
          return (
            <li key={`${crumb.label}-${i}`} className="p7-breadcrumbs-item">
              {i > 0 && (
                <span className="p7-breadcrumbs-sep" aria-hidden="true">
                  /
                </span>
              )}
              {isEllipsis ? (
                <span className="p7-breadcrumbs-ellipsis" aria-hidden="true">
                  …
                </span>
              ) : crumb.href && !isLast ? (
                <Link href={crumb.href as Route} className="p7-breadcrumbs-link">
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className="p7-breadcrumbs-current"
                  aria-current={isLast ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
