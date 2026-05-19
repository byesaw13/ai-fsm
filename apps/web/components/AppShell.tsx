"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Route } from "next";
import { ToastProvider } from "./ui/Toast";
import {
  IconSchedule,
  IconJobs,
  IconClients,
  IconEstimates,
  IconSettings,
  IconMyDay,
  IconField,
  IconMembership,
  IconDashboard,
} from "./NavIcons";

type IconComponent = (props: { size?: number }) => React.ReactElement;

interface NavItem {
  href: string;
  label: string;
  Icon: IconComponent;
  adminOnly?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const OPERATIONS_ITEMS: NavItem[] = [
  { href: "/app/my-day",    label: "My Day",   Icon: IconMyDay },
  { href: "/app/schedule",  label: "Schedule", Icon: IconSchedule, adminOnly: true },
  { href: "/app/jobs",      label: "Jobs",     Icon: IconJobs },
  { href: "/app/field",     label: "On Site",  Icon: IconField },
];

const BUSINESS_ITEMS: NavItem[] = [
  { href: "/app/clients",           label: "Clients",     Icon: IconClients,    adminOnly: true },
  { href: "/app/estimates",         label: "Estimates",   Icon: IconEstimates,  adminOnly: true },
  { href: "/app/maintenance-plans", label: "Memberships", Icon: IconMembership, adminOnly: true },
  { href: "/app/settings",          label: "Settings",    Icon: IconSettings },
];

const DASHBOARD_ITEMS: NavItem[] = [
  { href: "/app/membership-dashboard",  label: "Membership",  Icon: IconDashboard, adminOnly: true },
  { href: "/app/pricing-dashboard",     label: "Pricing",     Icon: IconDashboard, adminOnly: true },
  { href: "/app/operations-dashboard",  label: "Operations",  Icon: IconDashboard, adminOnly: true },
  { href: "/app/documents-dashboard",   label: "Documents",   Icon: IconDashboard, adminOnly: true },
];

/** Pure function — returns filtered nav sections for a given role */
export function getNavSections(role: string): NavSection[] {
  const sections: NavSection[] = [];

  const opsItems = role === "tech"
    ? OPERATIONS_ITEMS.filter((item) => !item.adminOnly)
    : OPERATIONS_ITEMS;
  if (opsItems.length > 0) sections.push({ label: "Operations", items: opsItems });

  const bizItems = role === "tech"
    ? BUSINESS_ITEMS.filter((item) => !item.adminOnly)
    : BUSINESS_ITEMS;
  if (bizItems.length > 0) sections.push({ label: "Business", items: bizItems });

  if (role !== "tech") {
    sections.push({ label: "Dashboards", items: DASHBOARD_ITEMS });
  }

  return sections;
}

/** Pure function — returns flat list of nav items for mobile bottom nav */
export function getBottomNavItems(role: string): NavItem[] {
  const myDay    = OPERATIONS_ITEMS.find((i) => i.href === "/app/my-day")!;
  const field    = OPERATIONS_ITEMS.find((i) => i.href === "/app/field")!;
  const jobs     = OPERATIONS_ITEMS.find((i) => i.href === "/app/jobs")!;

  if (role === "tech") {
    return [myDay, field, jobs];
  }

  const schedule  = OPERATIONS_ITEMS.find((i) => i.href === "/app/schedule")!;
  const clients   = BUSINESS_ITEMS.find((i) => i.href === "/app/clients")!;
  const estimates = BUSINESS_ITEMS.find((i) => i.href === "/app/estimates")!;
  return [myDay, schedule, jobs, clients, estimates];
}

/** Pure function — returns true if href is the active nav route for pathname */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

interface AppShellProps {
  role: string;
  children: ReactNode;
}

export function AppShell({ role, children }: AppShellProps) {
  const pathname = usePathname();
  const sections = getNavSections(role);
  const bottomItems = getBottomNavItems(role);
  const allItems = sections.flatMap((s) => s.items);
  const activeItem = allItems.find((item) => isNavActive(pathname, item.href));

  return (
    <ToastProvider>
      <div className="p7-layout">
        {/* ---- Desktop/Tablet Sidebar ---- */}
        <aside className="p7-sidebar" aria-label="Main navigation">
          {/* Brand */}
          <Link href={"/app" as Route} className="p7-sidebar-brand">
            <div className="p7-brand-logo" aria-hidden="true">
              <span className="p7-brand-logo-text">DV</span>
            </div>
            <span className="p7-brand-name">Dovetails</span>
          </Link>

          {/* Nav sections */}
          <nav className="p7-nav" aria-label="Primary navigation">
            {sections.map((section) => (
              <div key={section.label}>
                <div className="p7-nav-section">{section.label}</div>
                {section.items.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href as Route}
                      className={`p7-nav-item ${active ? "p7-nav-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      title={item.label}
                    >
                      <span className="p7-nav-icon" aria-hidden="true">
                        <item.Icon size={18} />
                      </span>
                      <span className="p7-nav-label">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Footer — user chip + logout */}
          <div className="p7-sidebar-footer">
            <div className="p7-user-chip">
              <div className="p7-user-avatar" aria-hidden="true">
                {activeItem ? activeItem.label[0]?.toUpperCase() : role[0]?.toUpperCase()}
              </div>
              <div className="p7-user-info">
                <span className="p7-user-name">Account</span>
                <span className="p7-user-role">{role}</span>
              </div>
            </div>
            <LogoutButton />
          </div>
        </aside>

        {/* ---- Main content ---- */}
        <main className="p7-main" id="main-content">
          {children}
        </main>

        {/* ---- Mobile bottom tab bar ---- */}
        <nav className="p7-bottom-nav" aria-label="Mobile navigation">
          <div className="p7-bottom-nav-inner">
            {bottomItems.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  className={`p7-bottom-nav-item ${active ? "p7-nav-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="p7-bottom-nav-icon" aria-hidden="true">
                    <item.Icon size={20} />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </ToastProvider>
  );
}

// ---- Logout button -------------------------------------------------------

function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="p7-logout-btn"
      aria-label="Sign out"
    >
      {pending ? "…" : "Out"}
    </button>
  );
}
