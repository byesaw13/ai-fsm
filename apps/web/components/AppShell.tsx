"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Route } from "next";
import { ToastProvider } from "./ui/Toast";
import {
  IconDashboard,
  IconSchedule,
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
  IconMyDay,
  IconMileage,
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
  { href: "/app/my-day",     label: "My Day",     Icon: IconMyDay },
  { href: "/app",             label: "Dashboard",  Icon: IconDashboard },
  { href: "/app/schedule",    label: "Schedule",   Icon: IconSchedule },
  { href: "/app/jobs",        label: "Jobs",       Icon: IconJobs },
  { href: "/app/visits",      label: "Visits",     Icon: IconVisits },

const BUSINESS_ITEMS: NavItem[] = [
  { href: "/app/owner-dashboard", label: "Command Center", Icon: IconReports, adminOnly: true },
  { href: "/app/clients",     label: "Clients",    Icon: IconClients,     adminOnly: true },
  { href: "/app/properties",  label: "Properties", Icon: IconProperties,  adminOnly: true },
  { href: "/app/invoices",    label: "Invoices",   Icon: IconInvoices,    adminOnly: true },
  { href: "/app/estimates",   label: "Estimates",  Icon: IconEstimates,   adminOnly: true },
  { href: "/app/price-book",  label: "Price Book", Icon: IconPriceBook,   adminOnly: true },
  { href: "/app/expenses",    label: "Expenses",   Icon: IconExpenses,    adminOnly: true },
  { href: "/app/mileage",     label: "Mileage",    Icon: IconMileage,    adminOnly: true },
  { href: "/app/maintenance-plans", label: "Maintenance Plans", Icon: IconSchedule, adminOnly: true },
  { href: "/app/automations", label: "Automations",Icon: IconAutomations, adminOnly: true },
  { href: "/app/reports",     label: "Reports",    Icon: IconReports,     adminOnly: true },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/app/settings", label: "Settings", Icon: IconSettings },
];

/** Pure function — returns filtered nav sections for a given role */
export function getNavSections(role: string): NavSection[] {
  const sections: NavSection[] = [];

  if (OPERATIONS_ITEMS.length > 0) sections.push({ label: "Operations", items: OPERATIONS_ITEMS });

  if (role !== "tech") {
    const bizItems = BUSINESS_ITEMS.filter((item) => !item.adminOnly || role !== "tech");
    if (bizItems.length > 0) sections.push({ label: "Business", items: bizItems });
  }

  if (ADMIN_ITEMS.length > 0) sections.push({ label: "System", items: ADMIN_ITEMS });

  return sections;
}

/** Pure function — returns flat list of nav items for mobile bottom nav */
export function getBottomNavItems(role: string): NavItem[] {
  if (role === "tech") return [OPERATIONS_ITEMS[0], OPERATIONS_ITEMS[2], OPERATIONS_ITEMS[3], OPERATIONS_ITEMS[4]];
  return [OPERATIONS_ITEMS[0], OPERATIONS_ITEMS[2], OPERATIONS_ITEMS[4], BUSINESS_ITEMS[2], BUSINESS_ITEMS[3]];
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
