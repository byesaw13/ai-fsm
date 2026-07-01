import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [users, reviewRows] = await Promise.all([
    queryForSession<{ full_name: string }>(
      session,
      `SELECT full_name FROM users WHERE id = $1`,
      [session.userId],
    ),
    queryForSession<{ pending: boolean }>(
      session,
      `SELECT (review_prompted_at IS NOT NULL AND closed_at IS NULL) AS pending
       FROM business_days
       WHERE account_id = $1 AND date = CURRENT_DATE`,
      [session.accountId],
    ),
  ]);
  const userName = users[0]?.full_name ?? "";
  const reviewPending = reviewRows[0]?.pending ?? false;

  return (
    <AppShell role={session.role} userName={userName} reviewPending={reviewPending}>
      {children}
    </AppShell>
  );
}
