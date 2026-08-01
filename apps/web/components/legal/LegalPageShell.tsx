import Link from "next/link";
import type { Route } from "next";
import {
  BUSINESS_LEGAL_NAME,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_SUPPORT_EMAIL,
} from "@/lib/sms/consent";

export function LegalPageShell({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f4f5",
        padding: "32px 16px 64px",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 12,
          padding: "40px 28px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <Link
            href="/booking"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              DV
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#111827", lineHeight: 1.1 }}>
                Dovetails
              </div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Services LLC</div>
            </div>
          </Link>
          <h1
            style={{
              margin: "0 0 8px",
              fontSize: 28,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
            Effective date: {effectiveDate}
          </p>
        </div>

        <div
          className="legal-prose"
          style={{
            fontSize: 15,
            lineHeight: 1.65,
            color: "#374151",
          }}
        >
          {children}
        </div>

        <footer
          style={{
            marginTop: 40,
            paddingTop: 20,
            borderTop: "1px solid #e5e7eb",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "#374151" }}>{BUSINESS_LEGAL_NAME}</strong>
          </p>
          <p style={{ margin: "0 0 4px" }}>
            Phone:{" "}
            <a href={`tel:${BUSINESS_PHONE_DISPLAY.replace(/\D/g, "")}`} style={{ color: "#2563eb" }}>
              {BUSINESS_PHONE_DISPLAY}
            </a>
          </p>
          <p style={{ margin: "0 0 16px" }}>
            Email:{" "}
            <a href={`mailto:${BUSINESS_SUPPORT_EMAIL}`} style={{ color: "#2563eb" }}>
              {BUSINESS_SUPPORT_EMAIL}
            </a>
          </p>
          <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link href={"/privacy" as Route} style={{ color: "#2563eb" }}>
              Privacy Policy
            </Link>
            <Link href={"/terms" as Route} style={{ color: "#2563eb" }}>
              Terms of Service
            </Link>
            <Link href="/booking" style={{ color: "#2563eb" }}>
              Request service
            </Link>
          </p>
        </footer>
      </div>
      <style>{`
        .legal-prose h2 {
          margin: 28px 0 10px;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
        }
        .legal-prose p { margin: 0 0 12px; }
        .legal-prose ul { margin: 0 0 12px; padding-left: 1.25rem; }
        .legal-prose li { margin-bottom: 6px; }
        .legal-prose a { color: #2563eb; }
      `}</style>
    </div>
  );
}
