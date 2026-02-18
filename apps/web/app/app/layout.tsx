import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const isTech = session.role === "tech";

  return (
    <div className="app-layout">
      <header className="app-header">
        <nav className="app-nav">
          <Link href="/app/jobs">Jobs</Link>
          <Link href="/app/visits">Visits</Link>
          {!isTech && <Link href="/app/estimates">Estimates</Link>}
          {!isTech && <Link href="/app/invoices">Invoices</Link>}
          {!isTech && <Link href="/app/automations">Automations</Link>}
        </nav>
        <div className="user-info">
          <span className="role-badge" data-role={session.role}>
            {session.role}
          </span>
          <LogoutButton />
        </div>
      </header>
      <main className="app-content">{children}</main>
    </div>
  );
}

function LogoutButton() {
  return (
    <form action="/api/v1/auth/logout" method="POST">
      <button type="submit">Logout</button>
    </form>
  );
}
