import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI-FSM",
  description: "AI-built field service app"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <div className="card">
            <h1>AI-FSM MVP</h1>
            <p>Jobs, visits, estimates, invoices, and automations.</p>
            <nav>
              <Link href="/app/jobs">Jobs</Link>{" | "}
              <Link href="/app/visits">Visits</Link>{" | "}
              <Link href="/app/estimates">Estimates</Link>{" | "}
              <Link href="/app/invoices">Invoices</Link>{" | "}
              <Link href="/app/automations">Automations</Link>
            </nav>
          </div>
          {children}
        </main>
      </body>
    </html>
  );
}
