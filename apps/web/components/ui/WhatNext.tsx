import Link from "next/link";
import type { Route } from "next";

/**
 * Single recommended next step for T2 nested detail pages.
 * Prefer one primary action — do not stack competing primaries on the same card.
 */
export function WhatNext({
  title,
  description,
  href,
  actionLabel,
  secondary,
}: {
  title: string;
  description?: string;
  href: string;
  actionLabel: string;
  secondary?: { href: string; label: string };
}) {
  return (
    <aside className="p7-what-next" aria-label="What next">
      <div className="p7-what-next-kicker">What next</div>
      <div className="p7-what-next-title">{title}</div>
      {description ? (
        <p className="p7-what-next-desc">{description}</p>
      ) : null}
      <div className="p7-what-next-actions">
        <Link href={href as Route} className="p7-btn p7-btn-primary p7-what-next-primary">
          {actionLabel}
        </Link>
        {secondary ? (
          <Link
            href={secondary.href as Route}
            className="p7-btn p7-btn-secondary p7-what-next-secondary"
          >
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
