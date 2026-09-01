import { redirect } from "next/navigation";
import type { Route } from "next";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import { businessToday } from "@/lib/operations/business-day";
import { AppShell } from "@/components/AppShell";
import {
  CAPTURE_PATH,
  loginRedirectForPath,
  pathnameFromHeaders,
} from "@/lib/auth/post-login-destination";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const pathname = pathnameFromHeaders(headerList);
  const session = await getSession();
  // Capture is the only path allowed to round-trip through /login?next=.
  if (!session) redirect(loginRedirectForPath(pathname) as Route);

  if (pathname === CAPTURE_PATH) {
    return <>{children}</>;
  }

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
       WHERE account_id = $1 AND business_date = $2::date`,
      [session.accountId, businessToday()],
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
