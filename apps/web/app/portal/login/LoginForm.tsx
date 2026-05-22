"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginForm() {
  const params = useSearchParams();
  const errorParam = params.get("error");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✉</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Check your email</h2>
        <p style={{ color: "#6b7280", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          If that email is registered, you&apos;ll receive a login link shortly.
          <br />
          It expires in 1 hour and can only be used once.
        </p>
        <button
          onClick={() => setSent(false)}
          style={{ marginTop: 20, background: "none", border: "none", color: "#2563eb", fontSize: 14, cursor: "pointer", padding: 0 }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/v1/portal/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {errorParam === "expired" && (
        <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, padding: "10px 14px", marginBottom: 16, color: "#92400e", fontSize: 14 }}>
          That link has expired or was already used. Request a new one below.
        </div>
      )}
      {errorParam === "invalid" && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: 14 }}>
          Invalid link. Please request a new one.
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="portal-email" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6, color: "#374151" }}>
          Email address
        </label>
        <input
          id="portal-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
          placeholder="you@example.com"
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 15,
            boxSizing: "border-box",
            outline: "none",
          }}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          background: "#111",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "11px 16px",
          fontSize: 15,
          fontWeight: 600,
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.65 : 1,
          transition: "opacity .15s",
        }}
      >
        {loading ? "Sending…" : "Send login link"}
      </button>
    </form>
  );
}
