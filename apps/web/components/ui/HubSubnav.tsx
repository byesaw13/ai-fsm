import Link from "next/link";
import type { Route } from "next";
import { activeHubHref, type HubLink } from "@/lib/navigation/hubs";

/**
 * T1 hub chrome — horizontal chips for siblings under Work / People / Money.
 */
export function HubSubnav({
  hub,
  links,
  pathname,
}: {
  hub: string;
  links: HubLink[];
  /** Current path (server pages pass the known list route). */
  pathname: string;
}) {
  const active = activeHubHref(pathname, links);

  return (
    <nav className="p7-hub-subnav" aria-label={`${hub} hub`}>
      <span className="p7-hub-subnav__label">{hub}</span>
      <div className="p7-hub-subnav__chips" role="list">
        {links.map((link) => {
          const isActive = link.href === active;
          return (
            <Link
              key={link.href}
              href={link.href as Route}
              role="listitem"
              className={`p7-hub-subnav__chip${isActive ? " p7-hub-subnav__chip--active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
