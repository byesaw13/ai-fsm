"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Card } from "@/components/ui";
import { CompanyForm } from "./CompanyForm";
import { TeamPanel, type TeamMember } from "./TeamPanel";
import { ProfileForm } from "./ProfileForm";
import { SquarePanel, type SquareStatus } from "./SquarePanel";
import { WorkspaceModeSetting } from "./WorkspaceModeSetting";
import { LocationDaySettings, type LocationDayValues } from "./LocationDaySettings";
import { TravelSettingsForm } from "./TravelSettingsForm";

interface Props {
  role: "owner" | "admin" | "tech";
  userId: string;
  me: { id: string; full_name: string; email: string; phone: string | null };
  account: { id: string; name: string; settings: any } | null;
  users: TeamMember[];
  square: SquareStatus | null;
  locationDay?: LocationDayValues;
}

export function SettingsTabsClient({ role, userId, me, account, users, square, locationDay }: Props) {
  const isAdmin = role === "owner" || role === "admin";
  const isOwner = role === "owner";

  // Determine available tabs
  const tabs = [
    { id: "profile", label: "Your Profile", icon: <ProfileIcon /> },
    ...(isOwner ? [{ id: "workspace", label: "Workspace View", icon: <WorkspaceIcon /> }] : []),
    ...(isAdmin && account ? [{ id: "company", label: "Company", icon: <CompanyIcon /> }] : []),
    ...(isAdmin && account ? [{ id: "travel", label: "Travel & Mileage", icon: <TravelIcon /> }] : []),
    ...(isAdmin ? [{ id: "team", label: "Team", icon: <TeamIcon /> }] : []),
    ...(isOwner && square ? [{ id: "payments", label: "Payments", icon: <PaymentsIcon /> }] : []),
    ...(isOwner && locationDay ? [{ id: "location-day", label: "Location & Day", icon: <LocationDayIcon /> }] : []),
    ...(isAdmin ? [{ id: "system-health", label: "System Health", icon: <HealthIcon /> }] : []),
    ...(isAdmin ? [{ id: "tools", label: "Tools & Setup", icon: <ToolsIcon /> }] : []),
  ];

  const [activeTab, setActiveTab] = useState(tabs[0].id);

  return (
    <div className="p7-settings-layout">
      {/* Sidebar navigation */}
      <div className="p7-settings-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`p7-settings-tab-btn ${activeTab === tab.id ? "active" : ""}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p7-settings-content">
        {activeTab === "profile" && (
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px 0" }}>Your Profile</h2>
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 0, marginBottom: 24 }}>
              Update your personal info, contact details, and account password.
            </p>
            <Card padding="default">
              <ProfileForm
                userId={me.id}
                initialName={me.full_name}
                initialEmail={me.email}
                initialPhone={me.phone}
                role={role}
              />
            </Card>
          </section>
        )}

        {activeTab === "workspace" && isOwner && (
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px 0" }}>Workspace View</h2>
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 0, marginBottom: 24 }}>
              Configure which interface view the app opens to by default on your devices.
            </p>
            <Card padding="default">
              <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 0, marginBottom: "var(--space-3)" }}>
                By default it follows your device — phones open to Field, tablets and computers open to Office.
              </p>
              <WorkspaceModeSetting />
            </Card>
          </section>
        )}

        {activeTab === "travel" && isAdmin && account && (
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px 0" }}>Travel & Mileage</h2>
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 0, marginBottom: 24 }}>
              Business origin, included service radius, mileage rates, and travel-time policy.
              Rates are snapshotted on each estimate — changing them never rewrites history.
            </p>
            <Card padding="default">
              <TravelSettingsForm />
            </Card>
          </section>
        )}

        {activeTab === "company" && isAdmin && account && (
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px 0" }}>Company Profile</h2>
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 0, marginBottom: 24 }}>
              Manage your business name, payment terms, and defaults.
            </p>
            <Card padding="default">
              <CompanyForm
                accountId={account.id}
                initialName={account.name}
                initialSettings={account.settings ?? {}}
              />
            </Card>
          </section>
        )}

        {activeTab === "team" && isAdmin && (
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px 0" }}>Team Directory</h2>
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 0, marginBottom: 24 }}>
              Manage team accounts, assign roles, and configure system permissions.
            </p>
            <TeamPanel
              initialMembers={users}
              currentUserId={userId}
              currentRole={role}
            />
          </section>
        )}

        {activeTab === "payments" && isOwner && square && (
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px 0" }}>Payments Setup</h2>
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 0, marginBottom: 24 }}>
              Link your Square account to handle customer card payments and deposits.
            </p>
            <Card padding="default">
              <p style={{ margin: "0 0 var(--space-4)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                Connect Square to create hosted card-payment links for invoices.
                Manual payment recording (Venmo, cash, check, Zelle, ACH) works
                whether or not Square is enabled.
              </p>
              <SquarePanel initial={square} />
            </Card>
          </section>
        )}

        {activeTab === "location-day" && isOwner && locationDay && (
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px 0" }}>Location & Day Review</h2>
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 0, marginBottom: 24 }}>
              Configure when end-of-day review prompts appear and how location stops are classified.
            </p>
            <Card padding="default">
              <LocationDaySettings {...locationDay} />
            </Card>
          </section>
        )}

        {activeTab === "system-health" && isAdmin && (
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px 0" }}>System Health</h2>
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 0, marginBottom: 24 }}>
              Monitor system state, service configurations, and encryption integrity.
            </p>
            <Card padding="default">
              <p style={{ margin: "0 0 var(--space-4)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                Check booking queue, client email dispatching, artificial intelligence integrations, Square status, and database configuration health.
              </p>
              <Link
                href={"/app/settings/system-health" as unknown as Route}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: "var(--text-sm)",
                  color: "var(--accent)",
                  fontWeight: "var(--font-medium)",
                  textDecoration: "none"
                }}
              >
                Open System Health Diagnostics &rarr;
              </Link>
            </Card>
          </section>
        )}

        {activeTab === "tools" && isAdmin && (
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px 0" }}>Tools & Setup</h2>
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 0, marginBottom: 24 }}>
              Quick access to core business modules and utility workspaces.
            </p>
            <Card padding="default">
              <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                Every workspace tool in one place — and your full menu on a phone, where the sidebar is hidden.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {[
                  { href: "/app/schedule",              label: "Schedule",             desc: "Week / month / year calendar views" },
                  { href: "/app/requests",              label: "Requests",             desc: "Intake queue and request management" },
                  { href: "/app/reports",               label: "Reports",              desc: "Revenue, pricing health, schedule utilization, and performance" },
                  { href: "/app/price-book",            label: "Price Book",           desc: "Materials and labor pricing catalog" },
                  { href: "/app/expenses",              label: "Expenses",             desc: "Job and business expense tracking" },
                  { href: "/app/automations",           label: "Automations",          desc: "Workflow automation rules" },
                ].map(({ href, label, desc }) => (
                  <Link
                    key={href}
                    href={href as unknown as Route}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "var(--space-3) 0",
                      borderBottom: "1px solid var(--border)",
                      textDecoration: "none",
                      color: "inherit"
                    }}
                  >
                    <span>
                      <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{label}</span>
                      <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>{desc}</span>
                    </span>
                    <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>→</span>
                  </Link>
                ))}
              </div>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}

// Inline SVGs for Tab Icons
function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function WorkspaceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function CompanyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <line x1="9" y1="22" x2="9" y2="16" />
      <line x1="9" y1="16" x2="15" y2="16" />
      <line x1="15" y1="16" x2="15" y2="22" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </svg>
  );
}

function TravelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function PaymentsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function HealthIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function ToolsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 1.4l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
    </svg>
  );
}

function LocationDayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="10" r="3" />
      <path d="M12 2a8 8 0 0 1 8 8c0 5-8 13-8 13S4 15 4 10a8 8 0 0 1 8-8z" />
    </svg>
  );
}
