import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db";
import { withDbSession } from "@/lib/db";
import { loadSquareSettings } from "@/lib/integrations/square-payments";
import { isEncryptionConfigured } from "@/lib/crypto";
import { PageContainer, PageHeader } from "@/components/ui";
import { SettingsTabsClient } from "./SettingsTabsClient";
import type { TeamMember } from "./TeamPanel";
import type { SquareStatus } from "./SquarePanel";

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
  // EPIC-006 Phase 5: techs reach Settings for their profile + sign out. The
  // admin-only sections below (Company, Team, Tools, System Health) stay gated
  // by `isAdmin`, so a tech sees only "Your profile".

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

  // Square payment integration is owner-only (secrets). Load current status.
  const isOwner = session.role === "owner";
  let square: SquareStatus | null = null;
  if (isOwner) {
    const row = await withDbSession(session, (client) =>
      loadSquareSettings(client, session.accountId)
    );
    square = {
      configured: !!row,
      enabled: row?.enabled ?? false,
      environment: row?.environment ?? "sandbox",
      locationId: row?.config.locationId ?? null,
      applicationId: row?.config.applicationId ?? null,
      webhookUrl: row?.config.webhookUrl ?? null,
      hasAccessToken: !!row?.secrets.accessToken,
      hasWebhookSignatureKey: !!row?.secrets.webhookSignatureKey,
      status: row?.status ?? "disconnected",
      statusDetail: row?.statusDetail ?? null,
      lastCheckedAt: row?.lastCheckedAt ?? null,
      encryptionConfigured: isEncryptionConfigured(),
    };
  }

  return (
    <PageContainer>
      <PageHeader title="Settings" />
      <SettingsTabsClient
        role={session.role}
        userId={session.userId}
        me={me}
        account={account}
        users={users as TeamMember[]}
        square={square}
      />
    </PageContainer>
  );
}
