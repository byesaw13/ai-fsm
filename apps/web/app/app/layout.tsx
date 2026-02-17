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

  return (
    <div className="app-layout">
      <header className="app-header">
        <nav>
          <Link href="/app/jobs">Jobs</Link>
          {" | "}
          <Link href="/app/visits">Visits</Link>
          {" | "}
          <Link href="/app/estimates">Estimates</Link>
          {" | "}
          <Link href="/app/invoices">Invoices</Link>
          {" | "}
          <Link href="/app/automations">Automations</Link>
        </nav>
        <div className="user-info">
          <span>Role: {session.role}</span>
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
