"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";

function ConfirmInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/portal/auth/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.redirected) {
        window.location.href = res.url;
      } else if (!res.ok) {
        router.push("/portal/login?error=expired");
      }
    } catch {
      setError(true);
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p style={{ color: "#991b1b" }}>
        Invalid link. <Link href="/portal/login" style={{ color: "#2563eb" }}>Request a new one.</Link>
      </p>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>🔑</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Open your portal</h2>
      <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 28px" }}>
        Click below to sign in to your Dovetails account.
      </p>

      {error && (
        <p style={{ color: "#991b1b", fontSize: 14, marginBottom: 16 }}>
          Something went wrong.{" "}
          <Link href="/portal/login" style={{ color: "#2563eb" }}>Request a new link.</Link>
        </p>
      )}

      <button
        onClick={handleConfirm}
        disabled={loading}
        style={{
          background: "#111",
          color: "#fff",
          border: "none",
          borderRadius: 7,
          padding: "13px 32px",
          fontSize: 15,
          fontWeight: 600,
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.65 : 1,
        }}
      >
        {loading ? "Opening…" : "Continue to my portal"}
      </button>
    </div>
  );
}

export default function PortalConfirmPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f9fafb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 40,
        }}
      >
        <Suspense>
          <ConfirmInner />
        </Suspense>
      </div>
    </div>
  );
}
