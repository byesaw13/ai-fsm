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
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Membership Pricing</h2>
            <Card padding="default">
              <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                Manage published prices for each membership tier. Published prices pre-fill when creating new maintenance plans.
              </p>
              <Link
                href={"/app/settings/membership-pricing" as unknown as Route}
                style={{ fontSize: "var(--text-sm)", color: "var(--accent)", fontWeight: "var(--font-medium)" }}
              >
                Manage Membership Pricing &rarr;
              </Link>
            </Card>
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
