import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db";
import { CompanyForm } from "./CompanyForm";
import { TeamPanel, type TeamMember } from "./TeamPanel";
import { ProfileForm } from "./ProfileForm";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { Card, PageContainer, PageHeader } from "@/components/ui";
import type { WorkspaceMode } from "@/components/AppShell";

export const dynamic = "force-dynamic";

interface AccountRow extends Record<string, unknown> {
  id: string;
  name: string;
  settings: { invoice_terms?: string; estimate_expiry_days?: number };
}

interface UserRow extends Record<string, unknown> {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: "owner" | "admin" | "tech";
  created_at: string;
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const cookieStore = await cookies();
  const rawMode = cookieStore.get("workspace_mode")?.value;
  const workspaceMode: WorkspaceMode =
    rawMode === "mobile" || rawMode === "desktop" || rawMode === "auto"
      ? rawMode
      : "auto";

  const isAdmin = session.role === "owner" || session.role === "admin";

  const [account, users, me] = await Promise.all([
    isAdmin
      ? queryOne<AccountRow>(`SELECT id, name, settings FROM accounts WHERE id = $1`, [session.accountId])
      : null,
    isAdmin
      ? query<UserRow>(
          `SELECT id, full_name, email, phone, role, created_at FROM users WHERE account_id = $1 ORDER BY role, full_name`,
          [session.accountId]
        )
      : [],
    queryOne<UserRow>(
      `SELECT id, full_name, email, phone, role FROM users WHERE id = $1`,
      [session.userId]
    ),
  ]);

  if (!me) redirect("/login");

  return (
    <PageContainer>
      <PageHeader title="Settings" />

      <div style={{ display: "flex", flexDirection: "column", gap: 40, maxWidth: 800 }}>

        {/* Workspace mode — available to all roles */}
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Workspace</h2>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginBottom: 16 }}>
            Choose how the app presents information. Mobile Workspace is optimized for field work;
            Desktop Workspace shows the full business dashboard.
          </p>
          <WorkspaceSwitcher currentMode={workspaceMode} />
        </section>

        {isAdmin && account && (
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Company</h2>
            <CompanyForm
              accountId={account.id}
              initialName={account.name}
              initialSettings={account.settings ?? {}}
            />
          </section>
        )}

        {isAdmin && (
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Team</h2>
            <TeamPanel
              initialMembers={users as TeamMember[]}
              currentUserId={session.userId}
              currentRole={session.role}
            />
          </section>
        )}

        {isAdmin && (
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>System Health</h2>
            <Card padding="default">
              <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                Check booking, email, AI, Stripe, portal-link, and database configuration.
              </p>
              <Link
                href={"/app/settings/system-health" as unknown as Route}
                style={{ fontSize: "var(--text-sm)", color: "var(--accent)", fontWeight: "var(--font-medium)" }}
              >
                View System Health &rarr;
              </Link>
            </Card>
          </section>
        )}


        {isAdmin && (
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Setup &amp; tools</h2>
            <Card padding="default">
              <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                Configuration and occasional tools. Day-to-day surfaces (Schedule, Requests, Reports) live in the main nav.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {[
                  // Memberships paused — link hidden until feature is re-enabled
                  // { href: "/app/membership-dashboard",  label: "Membership Dashboard", desc: "Active memberships, renewals, and labor cap status" },
                  { href: "/app/price-book",            label: "Price Book",           desc: "Materials and labor pricing catalog" },
                  { href: "/app/expenses",              label: "Expenses",             desc: "Job and business expense tracking" },
                  { href: "/app/automations",           label: "Automations",          desc: "Workflow automation rules" },
                ].map(({ href, label, desc }) => (
                  <Link
                    key={href}
                    href={href as unknown as Route}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-2) 0", borderBottom: "1px solid var(--border)", textDecoration: "none", color: "inherit" }}
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

        <section>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Your profile</h2>
          <ProfileForm
            userId={me.id}
            initialName={me.full_name}
            initialEmail={me.email}
            initialPhone={me.phone}
            role={session.role}
          />
        </section>

      </div>
    </PageContainer>
  );
}
