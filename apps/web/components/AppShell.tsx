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
  IconInvoices,
  IconBooking,
  IconProperties,
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

// ---------------------------------------------------------------------------
// Navigation definitions
// ---------------------------------------------------------------------------

const WORK_ITEMS: NavItem[] = [
  { href: "/app/schedule", label: "Schedule", Icon: IconSchedule, adminOnly: true },
  { href: "/app/jobs",     label: "Jobs",     Icon: IconJobs },
];

const CUSTOMER_ITEMS: NavItem[] = [
  { href: "/app/properties",       label: "Properties", Icon: IconProperties, adminOnly: true },
  { href: "/app/clients",          label: "Clients",    Icon: IconClients,    adminOnly: true },
  { href: "/app/booking-requests", label: "Intake",     Icon: IconBooking,    adminOnly: true },
];

const MONEY_ITEMS: NavItem[] = [
  { href: "/app/estimates",         label: "Estimates",   Icon: IconEstimates,  adminOnly: true },
  { href: "/app/invoices",          label: "Invoices",    Icon: IconInvoices,   adminOnly: true },
  { href: "/app/maintenance-plans", label: "Memberships", Icon: IconMembership, adminOnly: true },
];

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/** Returns filtered nav sections for a given role */
export function getNavSections(role: string): NavSection[] {
  const myDayHref = role === "tech" ? "/app/my-day" : "/app";
  const myDay: NavItem = { href: myDayHref, label: "My Day", Icon: IconMyDay };
  const filter = (items: NavItem[]) =>
    role === "tech" ? items.filter((i) => !i.adminOnly) : items;

  return [
    { label: "Work",      items: [myDay, ...filter(WORK_ITEMS)] },
    { label: "Customers", items: filter(CUSTOMER_ITEMS) },
    { label: "Money",     items: filter(MONEY_ITEMS) },
  ].filter((s) => s.items.length > 0);
}

/** Returns flat list for the mobile bottom tab bar */
export function getBottomNavItems(role: string): NavItem[] {
  const myDayHref = role === "tech" ? "/app/my-day" : "/app";
  const myDay: NavItem = { href: myDayHref, label: "My Day", Icon: IconMyDay };
  const field: NavItem = { href: "/app/field", label: "On Site", Icon: IconField };
  const jobs = WORK_ITEMS.find((i) => i.href === "/app/jobs")!;

  if (role === "tech") return [myDay, field, jobs];

  const schedule  = WORK_ITEMS.find((i) => i.href === "/app/schedule")!;
  const clients   = CUSTOMER_ITEMS.find((i) => i.href === "/app/clients")!;
  const estimates = MONEY_ITEMS.find((i) => i.href === "/app/estimates")!;
  return [myDay, schedule, jobs, clients, estimates];
}

/** Returns true if href is the active route for the current pathname */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

interface AppShellProps {
  role: string;
  userName?: string;
  children: ReactNode;
}

export function AppShell({ role, userName, children }: AppShellProps) {
  const pathname = usePathname();
  const sections = getNavSections(role);
  const bottomItems = getBottomNavItems(role);

  const settingsActive = isNavActive(pathname, "/app/settings");
  const avatarLetter = userName ? userName[0].toUpperCase() : role[0].toUpperCase();
  const displayName = userName || "Account";

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

          {/* Scrollable nav sections */}
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

            {/* Settings pinned to bottom of nav */}
            <div style={{ marginTop: "auto", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)" }}>
              <Link
                href={"/app/settings" as Route}
                className={`p7-nav-item ${settingsActive ? "p7-nav-active" : ""}`}
                aria-current={settingsActive ? "page" : undefined}
                title="Settings"
              >
                <span className="p7-nav-icon" aria-hidden="true">
                  <IconSettings size={18} />
                </span>
                <span className="p7-nav-label">Settings</span>
              </Link>
            </div>
          </nav>

          {/* Footer — user chip + logout */}
          <div className="p7-sidebar-footer">
            <div className="p7-user-chip">
              <div className="p7-user-avatar" aria-hidden="true">
                {avatarLetter}
              </div>
              <div className="p7-user-info">
                <span className="p7-user-name">{displayName}</span>
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

// ---------------------------------------------------------------------------
// Logout button
// ---------------------------------------------------------------------------

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
