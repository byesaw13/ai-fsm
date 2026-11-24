"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import type { Route } from "next";
import type { Role } from "@ai-fsm/domain";
import { ToastProvider } from "./ui/Toast";
import { NewButton } from "./NewButton";
import { CommandPalette } from "./CommandPalette";
import { CAPTURE_HREF, CaptureLink } from "./CaptureLink";
import { WorkspaceAutoRoute } from "./WorkspaceAutoRoute";
import { UI } from "@/lib/vocabulary";
import { homeEntryHref } from "@/lib/auth/post-login-destination";
import { LiveRefresh } from "./LiveRefresh";
import {
  IconDashboard,
  IconInbox,
  IconSettings,
  IconMap,
  IconMyDay,
  IconJobs,
  IconClients,
  IconInvoices,
  IconReports,
  IconDayReview,
  IconField,
  IconCapture,
} from "./NavIcons";
import {
  AttentionBell,
  NavCountBadge,
  useAttentionSummary,
} from "./attention/AttentionBell";
import { Logo } from "@/components/brand/Logo";

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
  /** Extra path prefixes that mark this item active (mobile hub tabs). */
  activePrefixes?: string[];
}

interface NavSection {
  label: string;
  items: NavItem[];
  /** Sidebar shows the label as a toggle; items stay closed until opened (TASK-237). */
  collapsible?: boolean;
}

// ---------------------------------------------------------------------------
// Navigation definitions — ONE model. Nested hubs (Home / Work / Customers / Money).
// Sidebar (≥768px) and More sheet (<768px) render the same sections; the bottom
// bar is a 4-hub shortcut subset (+ More button in AppShell).
// ---------------------------------------------------------------------------

// The office desk. Labelled "Desk" (not "Today") so it doesn't compete with the field home.
const NAV_TODAY:      NavItem = { href: "/app",              label: UI.desk,      Icon: IconDashboard };
// Field home. Owners can switch into it; pure admins (who don't do field work) never see it here.
const NAV_MY_DAY:     NavItem = { href: "/app/my-work",      label: UI.today,     Icon: IconMyDay };
const NAV_CAPTURE:    NavItem = { href: "/app/capture",      label: "Capture",    Icon: IconCapture };
const NAV_DAY_REVIEW: NavItem = { href: "/app/day-review",   label: "Day Review", Icon: IconDayReview };
const NAV_TRACKING:   NavItem = { href: "/app/timeline",     label: "Tracking",   Icon: IconField };
const NAV_REPORTS:    NavItem = { href: "/app/reports",      label: "Reports",    Icon: IconReports,   adminOnly: true };
const NAV_SETTINGS:   NavItem = { href: "/app/settings",     label: "Settings",   Icon: IconSettings,  adminOnly: true };
const NAV_MAP:        NavItem = { href: "/app/map",          label: "Map",        Icon: IconMap };

const NAV_ACTION_QUEUE: NavItem = { href: "/app/action-queue", label: "Action Queue", Icon: IconInbox, adminOnly: true };

/** The three hubs — the same items in the sidebar and the phone tabs (TASK-237). */
const HUB_JOBS: NavItem = {
  href: "/app/jobs",
  label: UI.jobs,
  Icon: IconJobs,
  activePrefixes: ["/app/jobs", "/app/requests", "/app/estimates", "/app/work-orders", "/app/schedule", "/app/visits"],
};
const HUB_CUSTOMERS: NavItem = {
  href: "/app/clients",
  label: UI.customers,
  Icon: IconClients,
  activePrefixes: ["/app/clients", "/app/properties"],
};
const HUB_MONEY: NavItem = {
  href: "/app/invoices",
  label: "Money",
  Icon: IconInvoices,
  activePrefixes: ["/app/invoices", "/app/expenses", "/app/materials", "/app/mileage"],
};

/**
 * Five places to go (TASK-237): the home, Jobs, Customers, Money, and More.
 * Requests, Estimates and Schedule are tabs inside Jobs; Properties inside
 * Customers; expenses and mileage inside Money.
 */
function buildHubSections(home: NavItem, more: NavItem[]): NavSection[] {
  return [
    { label: "", items: [home, HUB_JOBS, HUB_CUSTOMERS, HUB_MONEY] },
    { label: "More", collapsible: true, items: more },
  ];
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/** Returns filtered nav sections for a given role and active workspace view. */
export function getNavSections(role: Role, view: "office" | "field" = "field"): NavSection[] {
  if (role === "tech") {
    // Today only. Night is End day on that screen, not a second Day Review tab.
    const myDay: NavItem = { href: "/app/my-work", label: UI.today, Icon: IconMyDay };
    return [{ label: "", items: [myDay] }];
  }

  // EPIC-006 Phase 5: pure admins never see the field home.
  if (role === "admin") {
    return buildHubSections(NAV_TODAY, [
      NAV_CAPTURE, NAV_DAY_REVIEW, NAV_TRACKING, NAV_REPORTS, NAV_ACTION_QUEUE, NAV_SETTINGS,
    ]);
  }

  // Owner: sidebar reflects the ACTIVE workspace so the two homes never sit
  // side-by-side (TASK-058 follow-up). Shared business destinations stay in both.
  const home = view === "office" ? NAV_TODAY : NAV_MY_DAY;
  return buildHubSections(home, [
    NAV_CAPTURE, NAV_DAY_REVIEW, NAV_TRACKING, NAV_REPORTS, NAV_MAP, NAV_SETTINGS,
  ]);
}

/**
 * Mobile bottom tab shortcuts. Owner: Today / Jobs / Customers / Money;
 * Admin: Desk / Jobs / Customers / Money. AppShell adds More as the 5th slot.
 * Tech: Today. Visit kitchen is on Now (More), not a tab.
 */
export function getBottomNavItems(role: Role): NavItem[] {
  if (role === "tech") {
    const myDay: NavItem = { href: "/app/my-work", label: UI.today, Icon: IconMyDay };
    return [myDay];
  }

  const home: NavItem =
    role === "owner"
      ? {
          href: "/app/my-work",
          label: UI.today,
          Icon: IconMyDay,
          activePrefixes: ["/app/my-work", "/app/my-day", "/app/day-review", "/app/timeline", "/app/capture"],
        }
      : {
          href: "/app",
          label: UI.desk,
          Icon: IconDashboard,
          activePrefixes: ["/app/day-review", "/app/timeline", "/app/capture"],
        };

  return [home, HUB_JOBS, HUB_CUSTOMERS, HUB_MONEY];
}

/** Returns true if href (and optional hub prefixes) match the current pathname */
export function isNavActive(
  pathname: string,
  href: string,
  activePrefixes?: string[],
): boolean {
  if (activePrefixes?.length) {
    for (const prefix of activePrefixes) {
      if (prefix === "/app") {
        if (pathname === "/app") return true;
        continue;
      }
      if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
    }
  }
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

/** A collapsible section stays open while one of its pages is showing. */
function sectionHasActive(section: NavSection, pathname: string): boolean {
  return section.items.some((i) => isNavActive(pathname, i.href, i.activePrefixes));
}

/** Needs-attention badge for a hub: Jobs carries requests + estimates, Money carries invoices. */
export function navAttentionCount(
  href: string,
  a: { requestsCount: number; estimatesCount: number; invoicesCount: number },
): number {
  if (href === HUB_JOBS.href) return a.requestsCount + a.estimatesCount;
  if (href === HUB_MONEY.href) return a.invoicesCount;
  return 0;
}

interface AppShellProps {
  role: Role;
  userName?: string;
  reviewPending?: boolean;
  children: ReactNode;
}

export function AppShell({ role, userName, reviewPending, children }: AppShellProps) {
  const pathname = usePathname();
  // The sidebar follows the surface you're on: Today = field, everything else =
  // office. So Field never shows the Desk home and vice-versa.
  const sections = getNavSections(role, pathname.startsWith("/app/my-work") ? "field" : "office");
  const bottomItems = getBottomNavItems(role);
  const [showMore, setShowMore] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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
  // Logo goes to each role's home: Today for field roles, Desk for pure admins.
  const roleHome = role === "admin" ? "/app" : "/app/my-work";
  // Owner logo is a deliberate "take me home": steer to the preferred home (TASK-238).
  const homeHref = role === "owner" ? homeEntryHref(roleHome) : roleHome;

  const { summary: attention, refresh: refreshAttention } = useAttentionSummary(isAdminOrOwner);

  // Close the More sheet whenever navigation happens; refresh attention counts.
  useEffect(() => {
    setShowMore(false);
    if (isAdminOrOwner) void refreshAttention();
  }, [pathname, isAdminOrOwner, refreshAttention]);

  const avatarLetter = userName ? userName[0].toUpperCase() : role[0].toUpperCase();
  const displayName = userName || "Account";

  return (
    <ToastProvider>
      <LiveRefresh />
      <div className={`p7-layout ${collapsed ? "p7-layout-collapsed" : ""}`}>
        {/* ---- Desktop/Tablet Sidebar ---- */}
        <aside className="p7-sidebar" aria-label="Main navigation">
          {/* Brand */}
          <div style={{ position: "relative" }}>
            <Link href={homeHref as Route} className="p7-sidebar-brand">
              <div className="p7-brand-logo" aria-hidden="true">
                <Logo variant="icon" tone="reverse" height={29} alt="" />
              </div>
              <span className="p7-brand-name">Dovetails</span>
            </Link>
            {isAdminOrOwner && !collapsed && (
              <div style={{ position: "absolute", top: 10, right: 40, zIndex: 2 }}>
                <AttentionBell summary={attention} onChanged={() => void refreshAttention()} onDark />
              </div>
            )}
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

          <div style={{ display: "flex", gap: 8, padding: collapsed ? "8px 8px 0" : "12px 12px 0", alignItems: "center" }}>
            <FindButton testId="command-palette-open" onDark />
          </div>

          {/* The one New button (TASK-236) — owner/admin only */}
          {isAdminOrOwner && (
            <div style={{ padding: collapsed ? "0 8px" : "0 12px" }}>
              <NewButton placement="sidebar" />
            </div>
          )}

          {/* Scrollable nav sections */}
          <nav className="p7-nav" aria-label="Primary navigation">
            {sections.map((section, sectionIdx) => (
              <div key={sectionIdx}>
                {section.collapsible ? (
                  <button
                    type="button"
                    className="p7-nav-item"
                    data-testid="nav-more-toggle"
                    aria-expanded={moreOpen || sectionHasActive(section, pathname)}
                    onClick={() => setMoreOpen((v) => !v)}
                    title={section.label}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    <span className="p7-nav-icon" aria-hidden="true">⋯</span>
                    <span className="p7-nav-label">{section.label}</span>
                  </button>
                ) : (
                  section.label && <div className="p7-nav-section">{section.label}</div>
                )}
                {(!section.collapsible || moreOpen || sectionHasActive(section, pathname)) &&
                  section.items.map((item) => {
                  const active = isNavActive(pathname, item.href, item.activePrefixes);
                  const count = navAttentionCount(item.href, attention);
                  // Hubs open whole: the Money totals need every invoice (TASK-237).
                  const href = item.href as Route;
                  const navClass = `p7-nav-item ${active ? "p7-nav-active" : ""}`;
                  const navInner = (
                    <>
                      <span className="p7-nav-icon" aria-hidden="true" style={{ position: "relative" }}>
                        <item.Icon size={18} />
                        {item.href === NAV_DAY_REVIEW.href && reviewPending && (
                          <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%", background: "#ef4444", border: "1.5px solid var(--bg)" }} aria-label="Review pending" />
                        )}
                      </span>
                      <span className="p7-nav-label">{item.label}</span>
                      {isAdminOrOwner && <NavCountBadge count={count} />}
                    </>
                  );
                  if (item.href === CAPTURE_HREF) {
                    return (
                      <CaptureLink
                        key={item.href}
                        className={navClass}
                        aria-current={active ? "page" : undefined}
                        title={item.label}
                        style={{ display: "flex", alignItems: "center", gap: 8 }}
                      >
                        {navInner}
                      </CaptureLink>
                    );
                  }
                  return (
                    <Link
                      key={item.href}
                      href={href}
                      className={navClass}
                      aria-current={active ? "page" : undefined}
                      title={item.label}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      {navInner}
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
          {role === "owner" && (
            <Suspense fallback={null}>
              <WorkspaceAutoRoute />
            </Suspense>
          )}
          {children}
        </main>

        {/* ---- Mobile bottom tab bar ---- */}
        <nav className="p7-bottom-nav" aria-label="Mobile navigation">
          <div className="p7-bottom-nav-inner">
            {bottomItems.map((item) => {
              const active = isNavActive(pathname, item.href, item.activePrefixes);
              return (
                <Link
                  key={`${item.label}-${item.href}`}
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
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "8px 12px 0" }}>
                <FindButton />
                {isAdminOrOwner && (
                  <AttentionBell summary={attention} onChanged={() => void refreshAttention()} />
                )}
              </div>
              <div className="p7-more-sections">
                {sections.map((section, sectionIdx) => (
                  <div key={sectionIdx} className="p7-more-section">
                    {section.label ? (
                      <div className="p7-more-section-label">{section.label}</div>
                    ) : null}
                    <div className="p7-more-grid">
                      {section.items.map((item) => {
                        const active = isNavActive(pathname, item.href, item.activePrefixes);
                        const count = navAttentionCount(item.href, attention);
                        const href = item.href as Route;
                        const moreClass = `p7-more-item ${active ? "p7-nav-active" : ""}`;
                        const moreInner = (
                          <>
                            <span className="p7-nav-icon" aria-hidden="true" style={{ position: "relative" }}>
                              <item.Icon size={20} />
                              {item.href === NAV_DAY_REVIEW.href && reviewPending && (
                                <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%", background: "#ef4444", border: "1.5px solid var(--bg)" }} />
                              )}
                              {isAdminOrOwner && count > 0 && (
                                <span
                                  style={{
                                    position: "absolute",
                                    top: -6,
                                    right: -8,
                                    minWidth: 16,
                                    height: 16,
                                    padding: "0 4px",
                                    borderRadius: 999,
                                    background: "#dc2626",
                                    color: "#fff",
                                    fontSize: 10,
                                    fontWeight: 700,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {count > 99 ? "99+" : count}
                                </span>
                              )}
                            </span>
                            <span>{item.label}</span>
                          </>
                        );
                        if (item.href === CAPTURE_HREF) {
                          return (
                            <CaptureLink
                              key={item.href}
                              className={moreClass}
                              aria-current={active ? "page" : undefined}
                              onClick={() => setShowMore(false)}
                            >
                              {moreInner}
                            </CaptureLink>
                          );
                        }
                        return (
                          <Link
                            key={item.href}
                            href={href}
                            className={moreClass}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setShowMore(false)}
                          >
                            {moreInner}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
      {isAdminOrOwner &&
        !pathname.startsWith("/app/my-work") &&
        !pathname.startsWith("/app/my-day") &&
        !/^\/app\/visits\/[^/]+$/.test(pathname) &&
        !pathname.startsWith("/app/capture") && <NewButton placement="fab" />}
      <CommandPalette role={role} />
    </ToastProvider>
  );
}

function FindButton({ testId, onDark = false }: { testId?: string; onDark?: boolean }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => window.dispatchEvent(new Event("dovetails:find"))}
      aria-label="Find what you can do"
      title="Find (Ctrl/⌘ K)"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 6,
        border: onDark ? "1px solid var(--sidebar-line)" : "1px solid var(--border)",
        background: onDark ? "var(--sidebar-hover-bg)" : "var(--bg-card)",
        color: onDark ? "var(--sidebar-fg)" : "var(--fg-muted)",
        width: onDark ? "100%" : undefined,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Find
      <kbd style={{ fontSize: 11, opacity: 0.7 }}>⌘K</kbd>
    </button>
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
