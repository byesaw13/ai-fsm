"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Route } from "next";
import { ToastProvider } from "./ui/Toast";
import {
  IconDashboard,
  IconJobs,
  IconVisits,
  IconSchedule,
  IconClients,
  IconInvoices,
  IconEstimates,
  IconProperties,
  IconExpenses,
  IconAutomations,
  IconReports,
  IconSettings,
  IconPriceBook,
} from "./NavIcons";

type IconComponent = (props: { size?: number }) => React.ReactElement;

interface NavItem {
  href: string;
  label: string;
  Icon: IconComponent;
  adminOnly?: boolean;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/app",             label: "Dashboard",   Icon: IconDashboard },
  { href: "/app/jobs",        label: "Jobs",        Icon: IconJobs },
  { href: "/app/visits",      label: "Visits",      Icon: IconVisits },
  { href: "/app/schedule",    label: "Schedule",    Icon: IconSchedule },
  { href: "/app/clients",     label: "Clients",     Icon: IconClients,     adminOnly: true },
  { href: "/app/invoices",    label: "Invoices",    Icon: IconInvoices,    adminOnly: true },
  { href: "/app/estimates",   label: "Estimates",   Icon: IconEstimates,   adminOnly: true },
  { href: "/app/properties",  label: "Properties",  Icon: IconProperties,  adminOnly: true },
  { href: "/app/price-book",  label: "Price Book",  Icon: IconPriceBook,   adminOnly: true },
  { href: "/app/expenses",    label: "Expenses",    Icon: IconExpenses,    adminOnly: true },
  { href: "/app/automations", label: "Automations", Icon: IconAutomations, adminOnly: true },
  { href: "/app/reports",     label: "Reports",     Icon: IconReports,     adminOnly: true },
  { href: "/app/settings",    label: "Settings",    Icon: IconSettings },
];

/** Pure function — returns filtered nav items for a given role */
export function getNavItems(role: string): NavItem[] {
  return role === "tech"
    ? ALL_NAV_ITEMS.filter((item) => !item.adminOnly)
    : ALL_NAV_ITEMS;
}

/** Pure function — returns true if href is the active nav route for pathname */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}

interface AppShellProps {
  role: string;
  children: ReactNode;
}

export function AppShell({ role, children }: AppShellProps) {
  const pathname = usePathname();
  const navItems = getNavItems(role);
  const bottomItems = navItems.slice(0, 5);

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

          {/* Nav */}
          <nav className="p7-nav" aria-label="Primary navigation">
            {navItems.map((item) => {
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
          </nav>

          {/* Footer — user chip + logout */}
          <div className="p7-sidebar-footer">
            <div className="p7-user-chip">
              <div className="p7-user-avatar" aria-hidden="true">
                {role[0]?.toUpperCase()}
              </div>
              <span className="p7-user-role" data-role={role}>
                {role}
              </span>
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
