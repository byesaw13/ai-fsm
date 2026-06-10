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

  const users = await queryForSession<{ full_name: string }>(
    session,
    `SELECT full_name FROM users WHERE id = $1`,
    [session.userId],
  );
  const userName = users[0]?.full_name ?? "";

  return (
    <AppShell role={session.role} userName={userName}>
      {children}
    </AppShell>
  );
}
