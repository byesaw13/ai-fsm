/**
 * Nested-hubs IA helpers (TASK-081).
 * Sidebar owns destinations; list pages use these for in-page hub chips (T1).
 */

export type HubLink = {
  href: string;
  label: string;
};

export const WORK_HUB_LINKS: HubLink[] = [
  { href: "/app/requests", label: "Requests" },
  { href: "/app/estimates", label: "Estimates" },
  { href: "/app/jobs", label: "Projects" },
  { href: "/app/work-orders", label: "Work Orders" },
  { href: "/app/schedule", label: "Schedule" },
  { href: "/app/visits", label: "Visits" },
];

export const PEOPLE_HUB_LINKS: HubLink[] = [
  { href: "/app/clients", label: "Clients" },
  { href: "/app/properties", label: "Properties" },
];

export const MONEY_HUB_LINKS: HubLink[] = [
  { href: "/app/invoices", label: "Invoices" },
  { href: "/app/expenses", label: "Expenses" },
  { href: "/app/reports", label: "Reports" },
];

/** Prefix match, same rules as AppShell isNavActive for non-root paths. */
export function isHubLinkActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Prefer the most specific hub link when paths nest (e.g. avoid matching a parent).
 * Links are checked longest-href-first.
 */
export function activeHubHref(pathname: string, links: HubLink[]): string | null {
  const ordered = [...links].sort((a, b) => b.href.length - a.href.length);
  for (const link of ordered) {
    if (isHubLinkActive(pathname, link.href)) return link.href;
  }
  return null;
}
