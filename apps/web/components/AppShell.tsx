"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Route } from "next";
import type { Role } from "@ai-fsm/domain";
import { ToastProvider } from "./ui/Toast";
import { QuickLeadModal } from "./QuickLeadModal";
import { FloatingActionButton } from "./FloatingActionButton";
import {
  IconEstimates,
  IconInbox,
  IconSettings,
  IconMyDay,
  IconProperties,
  IconJobs,
  IconClients,
  IconInvoices,
  IconReports,
  IconVisits,
} from "./NavIcons";

export type WorkspaceMode = "mobile" | "desktop" | "auto";

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

// Named constants for items referenced outside the array (mobile bottom bar)
const NAV_TODAY:    NavItem = { href: "/app",            label: "Today",      Icon: IconMyDay };
const NAV_REQUESTS: NavItem = { href: "/app/requests",   label: "Requests",   Icon: IconInbox };
const NAV_PROPS:    NavItem = { href: "/app/properties", label: "Properties", Icon: IconProperties, adminOnly: true };
const NAV_JOBS:     NavItem = { href: "/app/jobs",       label: "Jobs",       Icon: IconJobs,       adminOnly: true };
const NAV_INVOICES: NavItem = { href: "/app/invoices",   label: "Invoices",   Icon: IconInvoices,   adminOnly: true };
const NAV_REPORTS:  NavItem = { href: "/app/reports",    label: "Reports",    Icon: IconReports,    adminOnly: true };
const NAV_SETTINGS: NavItem = { href: "/app/settings",   label: "Settings",   Icon: IconSettings,   adminOnly: true };

// Layer 1 — Daily Driver nav only. Advanced routes are accessible from Today or Settings — not in the sidebar.
const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    label: "",
    items: [
      NAV_TODAY,
      NAV_REQUESTS,
      { href: "/app/clients",   label: "Clients",    Icon: IconClients,   adminOnly: true },
      NAV_PROPS,
      { href: "/app/estimates", label: "Estimates",  Icon: IconEstimates, adminOnly: true },
      NAV_JOBS,
      NAV_INVOICES,
      NAV_REPORTS,
      NAV_SETTINGS,
    ],
  },
];

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/** Returns filtered nav sections for a given role */
export function getNavSections(role: Role): NavSection[] {
  if (role === "tech") {
    const myDay: NavItem = { href: "/app/my-day", label: "My Day", Icon: IconMyDay };
    const visits: NavItem = { href: "/app/visits", label: "Visits", Icon: IconVisits };
    return [{ label: "", items: [myDay, visits] }];
  }

  return ADMIN_NAV_SECTIONS;
}

/** Returns flat list for the mobile bottom tab bar */
export function getBottomNavItems(role: Role, workspaceMode: WorkspaceMode = "auto"): NavItem[] {
  if (role === "tech") {
    const myDay: NavItem = { href: "/app/my-day", label: "My Day", Icon: IconMyDay };
    const visits: NavItem = { href: "/app/visits", label: "Visits", Icon: IconVisits };
    return [myDay, visits];
  }

  if (workspaceMode === "mobile") {
    // Field-first: visits, jobs, invoices, inbox — not CRM admin links
    return [NAV_TODAY, NAV_JOBS, NAV_INVOICES, { href: "/app/inbox", label: "Inbox", Icon: IconInbox }];
  }

  return [NAV_TODAY, NAV_REQUESTS, NAV_JOBS, NAV_SETTINGS];
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
  role: Role;
  userName?: string;
  workspaceMode?: WorkspaceMode;
  children: ReactNode;
}

export function AppShell({ role, userName, workspaceMode = "auto", children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const sections = getNavSections(role);
  const bottomItems = getBottomNavItems(role, workspaceMode);
  const [showQuickLead, setShowQuickLead] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const isAdminOrOwner = role === "owner" || role === "admin";

  async function handleWorkspaceSwitch(mode: WorkspaceMode) {
    if (mode === workspaceMode || switchingMode) return;
    setSwitchingMode(true);
    try {
      await fetch("/api/v1/workspace-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      router.refresh();
    } finally {
      setSwitchingMode(false);
    }
  }

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

          {/* New Request button — owner/admin only */}
          {isAdminOrOwner && (
            <button
              type="button"
              onClick={() => setShowQuickLead(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 12px",
                margin: "4px 0 8px",
                borderRadius: 6,
                border: "1px solid var(--accent, #0f172a)",
                background: "var(--accent, #0f172a)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 16 }}>⚡</span>
              New Request
            </button>
          )}

          {/* Scrollable nav sections */}
          <nav className="p7-nav" aria-label="Primary navigation">
            {sections.map((section, sectionIdx) => (
              <div key={sectionIdx}>
                {section.label && <div className="p7-nav-section">{section.label}</div>}
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

          {/* Footer — workspace switcher + user chip + logout */}
          <div className="p7-sidebar-footer">
            {isAdminOrOwner && (
              <div className="p7-workspace-switcher" aria-label="Workspace mode">
                <span className="p7-workspace-label">Workspace</span>
                <div className="p7-workspace-options">
                  {(["mobile", "desktop", "auto"] as WorkspaceMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleWorkspaceSwitch(mode)}
                      disabled={switchingMode}
                      aria-pressed={workspaceMode === mode}
                      className={`p7-workspace-btn ${workspaceMode === mode ? "p7-workspace-btn-active" : ""}`}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
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
      {showQuickLead && <QuickLeadModal onClose={() => setShowQuickLead(false)} />}
      {isAdminOrOwner && <FloatingActionButton />}
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
