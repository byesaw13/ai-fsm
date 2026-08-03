import type { Route } from "next";
import Link from "next/link";

/** Branded 404 — replaces the default Next.js "This page could not be found." shell. */
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        background: "var(--bg, #fafaf9)",
        fontFamily: "var(--font-archivo, system-ui, sans-serif)",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 28,
            textDecoration: "none",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "linear-gradient(135deg, #c1540f 0%, #9a3f0a 100%)",
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
          <span style={{ fontWeight: 800, fontSize: 18, color: "var(--fg, #1c1917)" }}>
            Dovetails
          </span>
        </div>

        <p
          style={{
            margin: "0 0 8px",
            fontSize: 56,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--accent, #c1540f)",
            lineHeight: 1,
          }}
        >
          404
        </p>
        <h1
          style={{
            margin: "0 0 12px",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--fg, #1c1917)",
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            margin: "0 0 28px",
            fontSize: 15,
            lineHeight: 1.5,
            color: "var(--fg-secondary, #57534e)",
          }}
        >
          That link doesn&apos;t match anything in Dovetails. Head home or request a service
          visit.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "center",
          }}
        >
          <Link
            href={"/" as Route}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
              padding: "10px 20px",
              borderRadius: 8,
              background: "var(--accent, #c1540f)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Go to app
          </Link>
          <Link
            href={"/booking" as Route}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid var(--border, #e7e5e4)",
              background: "var(--bg-card, #fff)",
              color: "var(--fg, #1c1917)",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Request service
          </Link>
        </div>
      </div>
    </div>
  );
}
