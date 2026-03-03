"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Route } from "next";
import { ToastProvider } from "./ui/Toast";

// ---------------------------------------------------------------------------
// AppShell — P7 sidebar-based navigation shell
//
// Desktop (≥1024px): Fixed left sidebar 240px.
// Tablet (768–1023px): Collapsed sidebar 56px, icon only with tooltips.
// Mobile (<768px): Fixed bottom tab bar, hidden sidebar.
//
// Source: Dovelite AdminLayout.tsx — sidebar + bottom nav dual pattern.
// Active state: left accent border + background highlight.
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/app" as const,             label: "Dashboard",   icon: "⊞" },
  { href: "/app/jobs" as const,        label: "Jobs",        icon: "📋" },
  { href: "/app/visits" as const,      label: "Visits",      icon: "📅" },
  { href: "/app/clients" as const,     label: "Clients",     icon: "👥", adminOnly: true },
  { href: "/app/invoices" as const,    label: "Invoices",    icon: "💰", adminOnly: true },
  { href: "/app/estimates" as const,   label: "Estimates",   icon: "📄", adminOnly: true },
  { href: "/app/properties" as const,  label: "Properties",  icon: "🏠", adminOnly: true },
  { href: "/app/expenses" as const,    label: "Expenses",    icon: "🧾", adminOnly: true },
  { href: "/app/automations" as const, label: "Automations", icon: "⚙", adminOnly: true },
];

/** Pure function — returns filtered nav items for a given role */
export function getNavItems(role: string): NavItem[] {
  const isTech = role === "tech";
  return isTech
    ? ALL_NAV_ITEMS.filter((item) => !item.adminOnly)
    : ALL_NAV_ITEMS;
}

/** Pure function — returns true if href is the active nav route for pathname */
export function isNavActive(pathname: string, href: string): boolean {
  // Dashboard: exact match only (so /app is not active when on /app/jobs)
  if (href === "/app") {
    return pathname === "/app";
  }
  return pathname === href || pathname.startsWith(href + "/");
}

interface AppShellProps {
  role: string;
  children: ReactNode;
}

export function AppShell({ role, children }: AppShellProps) {
  const pathname = usePathname();
  const navItems = getNavItems(role);

  // Mobile bottom tab shows max 5 items
  const bottomItems = navItems.slice(0, 5);

  return (
    <ToastProvider>
      <div className="p7-layout">
        {/* ---- Desktop/Tablet Sidebar ---- */}
        <aside className="p7-sidebar" aria-label="Main navigation">
          {/* Brand */}
          <Link href={"/app" as Route} className="p7-sidebar-brand">
            <div className="p7-brand-logo" aria-hidden="true">
              <span className="p7-brand-logo-text">FS</span>
            </div>
            <span className="p7-brand-name">FieldSync</span>
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
                    {item.icon}
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
                    {item.icon}
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
