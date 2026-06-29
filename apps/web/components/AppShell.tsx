"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Route } from "next";
import type { Role } from "@ai-fsm/domain";
import { ToastProvider } from "./ui/Toast";
import { QuickLeadModal } from "./QuickLeadModal";
import { FloatingActionButton } from "./FloatingActionButton";
import { WorkspaceAutoRoute } from "./WorkspaceAutoRoute";
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
  IconSchedule,
} from "./NavIcons";

type IconComponent = (props: { size?: number }) => React.ReactElement;

function IconChevronLeft({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

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
// Navigation definitions — ONE model. The sidebar (≥768px) and the More sheet
// (<768px) render the same list; the bottom bar is a shortcut subset of it.
// ---------------------------------------------------------------------------

// Named constants for items referenced outside the array (mobile bottom bar)
// The office overview/dashboard. Labelled "Overview" (not "Today") so it reads
// as the numbers screen and doesn't compete with the My Day field surface.
const NAV_TODAY:    NavItem = { href: "/app",              label: "Overview", Icon: IconMyDay };
// EPIC-006 Phase 5: the field surface. Owners can switch into it; pure admins
// (who don't do field work) and the all-techs list never see it here.
const NAV_MY_DAY:   NavItem = { href: "/app/my-day",       label: "My Day",   Icon: IconMyDay };
const NAV_REQUESTS: NavItem = { href: "/app/requests",     label: "Requests", Icon: IconInbox };
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
      NAV_MY_DAY,
      NAV_REQUESTS,
      { href: "/app/clients",   label: "Clients",    Icon: IconClients,   adminOnly: true },
      NAV_PROPS,
      { href: "/app/estimates", label: "Estimates",  Icon: IconEstimates, adminOnly: true },
      NAV_JOBS,
      { href: "/app/work-orders", label: "Work Orders", Icon: IconJobs, adminOnly: true },
      { href: "/app/schedule",  label: "Schedule",   Icon: IconSchedule,  adminOnly: true },
      NAV_INVOICES,
      NAV_REPORTS,
      NAV_SETTINGS,
    ],
  },
];

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/** Returns filtered nav sections for a given role and active workspace view. */
export function getNavSections(role: Role, view: "office" | "field" = "field"): NavSection[] {
  if (role === "tech") {
    const myDay: NavItem = { href: "/app/my-day", label: "My Day", Icon: IconMyDay };
    const visits: NavItem = { href: "/app/visits", label: "Visits", Icon: IconVisits };
    return [{ label: "", items: [myDay, visits] }];
  }

  // EPIC-006 Phase 5: only the owner does field work, so only the owner gets the
  // My Day switch. Pure admins run the business and never see the field surface.
  if (role === "admin") {
    return ADMIN_NAV_SECTIONS.map((s) => ({
      ...s,
      items: s.items.filter((i) => i.href !== NAV_MY_DAY.href),
    }));
  }

  // Owner = the all-rounder, but the sidebar reflects the ACTIVE workspace so the
  // two "homes" never sit side-by-side (TASK-058 follow-up): My Day leads in
  // Field, Overview leads in Office; the other home is reached from Settings →
  // Workspace. The shared business destinations appear in both.
  const base = ADMIN_NAV_SECTIONS[0].items.filter(
    (i) => i.href !== NAV_MY_DAY.href && i.href !== NAV_TODAY.href,
  );
  const home = view === "office" ? NAV_TODAY : NAV_MY_DAY;
  return [{ label: "", items: [home, ...base] }];
}

/**
 * Returns the link items for the mobile bottom tab bar. For owner/admin this
 * is a 3-item shortcut subset — the bar's 4th slot is the More button (added
 * by AppShell), which opens the full nav so every destination stays reachable
 * on a phone.
 */
export function getBottomNavItems(role: Role): NavItem[] {
  if (role === "tech") {
    const myDay: NavItem = { href: "/app/my-day", label: "My Day", Icon: IconMyDay };
    const visits: NavItem = { href: "/app/visits", label: "Visits", Icon: IconVisits };
    return [myDay, visits];
  }

  // Owner leads with My Day; pure admins keep the Overview dashboard up front.
  if (role === "owner") {
    return [NAV_MY_DAY, NAV_REQUESTS, NAV_JOBS];
  }

  return [NAV_TODAY, NAV_REQUESTS, NAV_JOBS];
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
  children: ReactNode;
}

export function AppShell({ role, userName, children }: AppShellProps) {
  const pathname = usePathname();
  // The sidebar follows the surface you're on: My Day = field, everything else =
  // office. So Field never shows the Overview home and vice-versa.
  const sections = getNavSections(role, pathname.startsWith("/app/my-day") ? "field" : "office");
  const bottomItems = getBottomNavItems(role);
  const [showQuickLead, setShowQuickLead] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const val = localStorage.getItem("p7-sidebar-collapsed");
    if (val === "true") {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("p7-sidebar-collapsed", String(next));
  };

  const isAdminOrOwner = role === "owner" || role === "admin";
  // Logo goes to each role's home: My Day for field roles, the office dashboard
  // for pure admins (who get bounced there from My Day anyway).
  const homeHref = role === "admin" ? "/app" : "/app/my-day";

  // Close the More sheet whenever navigation happens.
  useEffect(() => {
    setShowMore(false);
  }, [pathname]);

  const avatarLetter = userName ? userName[0].toUpperCase() : role[0].toUpperCase();
  const displayName = userName || "Account";

  return (
    <ToastProvider>
      <div className={`p7-layout ${collapsed ? "p7-layout-collapsed" : ""}`}>
        {/* ---- Desktop/Tablet Sidebar ---- */}
        <aside className="p7-sidebar" aria-label="Main navigation">
          {/* Brand */}
          <div style={{ position: "relative" }}>
            <Link href={homeHref as Route} className="p7-sidebar-brand">
              <div className="p7-brand-logo" aria-hidden="true">
                <span className="p7-brand-logo-text">DV</span>
              </div>
              <span className="p7-brand-name">Dovetails</span>
            </Link>
            <button
              type="button"
              onClick={toggleCollapse}
              className="p7-sidebar-toggle-btn"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
            </button>
          </div>

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

          {/* Footer — user chip + logout */}
          <div className="p7-sidebar-footer">
            {/* Tech sidebar nav has no Settings entry — surface it here so the
                profile + sign out are reachable on desktop too (EPIC-006 P5). */}
            {role === "tech" && (
              <Link
                href={"/app/settings" as Route}
                className={`p7-nav-item ${isNavActive(pathname, "/app/settings") ? "p7-nav-active" : ""}`}
                title="Settings"
                style={{ marginBottom: "var(--space-2)" }}
              >
                <span className="p7-nav-icon" aria-hidden="true"><IconSettings size={18} /></span>
                <span className="p7-nav-label">Settings</span>
              </Link>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", width: "100%" }}>
              <div className="p7-user-chip" title={displayName}>
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
          {/* TASK-058: workspace mode is automatic by device (phone → Field,
              tablet/computer → Office) with an override in Settings — no on-screen
              toggle or daily popup. This renders nothing; it only steers entry. */}
          {role === "owner" && <WorkspaceAutoRoute />}
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
                  className={`p7-bottom-nav-item ${active && !showMore ? "p7-nav-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="p7-bottom-nav-icon" aria-hidden="true">
                    <item.Icon size={20} />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
            {/* EPIC-006 Phase 5: every role gets the More sheet so Settings and
                Sign out are reachable on a phone (sidebar is hidden < 768px). */}
            {(
              <button
                type="button"
                className={`p7-bottom-nav-item p7-more-btn ${showMore ? "p7-nav-active" : ""}`}
                aria-expanded={showMore}
                aria-controls="p7-more-sheet"
                onClick={() => setShowMore((v) => !v)}
              >
                <span className="p7-bottom-nav-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.8" fill="currentColor" />
                    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                    <circle cx="19" cy="12" r="1.8" fill="currentColor" />
                  </svg>
                </span>
                <span>More</span>
              </button>
            )}
          </div>
        </nav>

        {/* ---- Mobile "More" sheet — the complete nav on a phone ---- */}
        {showMore && (
          <>
            <div
              className="p7-more-overlay"
              aria-hidden="true"
              onClick={() => setShowMore(false)}
            />
            <div id="p7-more-sheet" className="p7-more-sheet" role="dialog" aria-label="All destinations">
              <div className="p7-more-grid">
                {sections.flatMap((s) => s.items).map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href as Route}
                      className={`p7-more-item ${active ? "p7-nav-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setShowMore(false)}
                    >
                      <span className="p7-nav-icon" aria-hidden="true">
                        <item.Icon size={20} />
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
              <div className="p7-more-footer">
                <div className="p7-user-chip">
                  <div className="p7-user-avatar" aria-hidden="true">{avatarLetter}</div>
                  <div className="p7-user-info">
                    <span className="p7-user-name">{displayName}</span>
                    <span className="p7-user-role">{role}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <Link
                    href={"/app/settings" as Route}
                    className="p7-nav-item"
                    style={{ padding: "6px 10px", fontSize: 13 }}
                    onClick={() => setShowMore(false)}
                  >
                    <span className="p7-nav-icon" aria-hidden="true"><IconSettings size={18} /></span>
                    <span className="p7-nav-label">Settings</span>
                  </Link>
                  <LogoutButton />
                </div>
              </div>
            </div>
          </>
        )}
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
      title="Sign out"
    >
      {pending ? "…" : "Sign out"}
    </button>
  );
}
