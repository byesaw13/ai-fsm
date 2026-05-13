import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { Card, PageContainer, PageHeader, SectionHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "missing" | "partial" | "optional" | "fail";

type HealthItem = {
  name: string;
  status: HealthStatus;
  label: string;
  detail: string;
  impact: string;
  href?: string;
};

function hasEnv(name: string): boolean {
  return !!process.env[name]?.trim();
}

async function checkDb(): Promise<HealthItem> {
  try {
    await getPool().query("SELECT 1");
    return {
      name: "Database",
      status: "ok",
      label: "Connected",
      detail: "PostgreSQL responded to a lightweight readiness query.",
      impact: "Core app workflows are available.",
      href: "/api/health",
    };
  } catch {
    return {
      name: "Database",
      status: "fail",
      label: "Failed",
      detail: "PostgreSQL did not respond to the readiness query.",
      impact: "The app cannot reliably load or save operational data.",
      href: "/api/health",
    };
  }
}

function bookingHealth(): HealthItem {
  const configured = hasEnv("BOOKING_ACCOUNT_ID");
  return {
    name: "Public Booking",
    status: configured ? "ok" : "missing",
    label: configured ? "Configured" : "Missing",
    detail: configured
      ? "BOOKING_ACCOUNT_ID is set."
      : "BOOKING_ACCOUNT_ID is not set.",
    impact: configured
      ? "Public /booking submissions can be assigned to an account."
      : "Public /booking submissions return unavailable until this is configured.",
    href: "/booking",
  };
}

function emailHealth(): HealthItem {
  const fields = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
  const present = fields.filter(hasEnv);
  const complete = present.length === fields.length;
  return {
    name: "Email Sending",
    status: complete ? "ok" : present.length > 0 ? "partial" : "missing",
    label: complete ? "Configured" : present.length > 0 ? "Partial" : "Missing",
    detail: complete
      ? "SMTP_HOST, SMTP_USER, and SMTP_PASS are set."
      : `Required SMTP fields set: ${present.length}/${fields.length}.`,
    impact: complete
      ? "Estimate and invoice emails can be sent."
      : "Estimate and invoice send actions cannot deliver email until SMTP is complete.",
    href: "/app/estimates",
  };
}

function aiHealth(): HealthItem {
  const configured = hasEnv("ANTHROPIC_API_KEY");
  return {
    name: "AI Assistance",
    status: configured ? "ok" : "optional",
    label: configured ? "Configured" : "Optional",
    detail: configured
      ? "ANTHROPIC_API_KEY is set."
      : "ANTHROPIC_API_KEY is not set.",
    impact: configured
      ? "Scope parsing, estimate review, receipt scanning, and item suggestions can call the AI provider."
      : "AI features fall back or are disabled, but core job workflows still work.",
    href: "/app/estimates/new",
  };
}

function stripeHealth(): HealthItem {
  const secret = hasEnv("STRIPE_SECRET_KEY");
  const publishable = hasEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  const webhook = hasEnv("STRIPE_WEBHOOK_SECRET");
  const count = [secret, publishable, webhook].filter(Boolean).length;
  const complete = secret && publishable && webhook;
  return {
    name: "Stripe Payments",
    status: complete ? "ok" : count > 0 ? "partial" : "optional",
    label: complete ? "Configured" : count > 0 ? "Partial" : "Optional",
    detail: complete
      ? "Secret key, publishable key, and webhook secret are set."
      : `Stripe fields set: ${count}/3.`,
    impact: complete
      ? "Online invoice payment integration can operate."
      : "Manual payment tracking still works; online payment collection is incomplete.",
    href: "/app/invoices",
  };
}

function appUrlHealth(): HealthItem {
  const appUrl = hasEnv("APP_URL");
  const publicUrl = hasEnv("NEXT_PUBLIC_APP_URL");
  const complete = appUrl && publicUrl;
  return {
    name: "Portal Links",
    status: complete ? "ok" : appUrl || publicUrl ? "partial" : "missing",
    label: complete ? "Configured" : appUrl || publicUrl ? "Partial" : "Missing",
    detail: complete
      ? "APP_URL and NEXT_PUBLIC_APP_URL are set."
      : "APP_URL and NEXT_PUBLIC_APP_URL should both be set for stable customer links.",
    impact: complete
      ? "Customer estimate, invoice, and portal links use configured URLs."
      : "Generated customer links may be blank, relative, or environment-dependent.",
    href: "/app/clients",
  };
}

function statusStyle(status: HealthStatus) {
  if (status === "ok") return { bg: "#dcfce7", fg: "#166534" };
  if (status === "partial") return { bg: "#fef3c7", fg: "#92400e" };
  if (status === "missing" || status === "fail") return { bg: "#fee2e2", fg: "#991b1b" };
  return { bg: "var(--bg-subtle)", fg: "var(--fg-muted)" };
}

function HealthCard({ item }: { item: HealthItem }) {
  const colors = statusStyle(item.status);
  return (
    <Card>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 700 }}>
              {item.name}
            </h2>
            <span
              style={{
                background: colors.bg,
                color: colors.fg,
                borderRadius: 999,
                padding: "2px 8px",
                fontSize: "var(--text-xs)",
                fontWeight: 700,
              }}
            >
              {item.label}
            </span>
          </div>
          <p style={{ margin: "var(--space-2) 0 0", color: "var(--fg)", fontSize: "var(--text-sm)" }}>
            {item.detail}
          </p>
          <p style={{ margin: "var(--space-1) 0 0", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
            {item.impact}
          </p>
        </div>
        {item.href && (
          <Link
            href={item.href as Route}
            style={{
              color: "var(--accent)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Open →
          </Link>
        )}
      </div>
    </Card>
  );
}

export default async function SystemHealthPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin") redirect("/app/settings");

  const items = [
    await checkDb(),
    bookingHealth(),
    emailHealth(),
    aiHealth(),
    stripeHealth(),
    appUrlHealth(),
  ];

  const blockingCount = items.filter((item) => item.status === "missing" || item.status === "fail").length;
  const partialCount = items.filter((item) => item.status === "partial").length;

  return (
    <PageContainer>
      <PageHeader
        title="System Health"
        subtitle={`${blockingCount} missing or failed · ${partialCount} partial`}
        backHref="/app/settings"
        backLabel="Settings"
      />

      <div style={{ display: "grid", gap: "var(--space-4)", maxWidth: 900 }}>
        <Card>
          <SectionHeader title="Configuration Readiness" />
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
            Runtime values are checked without displaying secret contents. Missing required
            settings explain which feature is affected.
          </p>
        </Card>

        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {items.map((item) => (
            <HealthCard key={item.name} item={item} />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
