"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface AppShellProps {
  role: string;
  children: React.ReactNode;
}

export function AppShell({ role, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isTech = role === "tech";

  const navItems = [
    { href: "/app/jobs" as const, label: "Jobs" },
    { href: "/app/visits" as const, label: "Visits" },
    ...(isTech
      ? []
      : [
          { href: "/app/estimates" as const, label: "Estimates" },
          { href: "/app/invoices" as const, label: "Invoices" },
          { href: "/app/automations" as const, label: "Automations" },
        ]),
  ];

  function isActive(href: string): boolean {
    if (href === "/app/jobs" && pathname === "/app") return true;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header-left">
          <Link href="/app/jobs" className="app-brand">
            <div className="app-logo">
              <span className="app-logo-text">FS</span>
            </div>
            <span className="app-title">FieldSync</span>
          </Link>

          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
        </div>

        <nav className={`app-nav ${mobileMenuOpen ? "mobile-open" : ""}`}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive(item.href) ? "nav-active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="user-info">
          <span className="role-badge" data-role={role}>
            {role}
          </span>
          <LogoutButton />
        </div>
      </header>
      <main className="app-content">{children}</main>
    </div>
  );
}

function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="logout-btn"
    >
      {pending ? "..." : "Logout"}
    </button>
  );
}
