import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db";
import { CompanyForm } from "./CompanyForm";
import { TeamPanel, type TeamMember } from "./TeamPanel";
import { ProfileForm } from "./ProfileForm";
import { Card, PageContainer, PageHeader } from "@/components/ui";

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
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Tools &amp; setup</h2>
            <Card padding="default">
              <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                Every workspace tool in one place — and your full menu on a phone, where the sidebar is hidden.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {[
                  // Day-to-day surfaces — also in the desktop sidebar, kept here so
                  // they stay reachable on mobile (sidebar is hidden below 768px).
                  { href: "/app/schedule",              label: "Schedule",             desc: "Week / month / year calendar views" },
                  { href: "/app/requests",              label: "Requests",             desc: "Intake queue and request management" },
                  { href: "/app/reports",               label: "Reports",              desc: "Revenue, pricing health, schedule utilization, and performance" },
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
