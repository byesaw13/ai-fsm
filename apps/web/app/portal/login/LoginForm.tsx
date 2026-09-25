"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginForm({ textEnabled = false }: { textEnabled?: boolean }) {
  const params = useSearchParams();
  const errorParam = params.get("error");

  const [mode, setMode] = useState<"phone" | "email">(textEnabled ? "phone" : "email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  if (sent) {
    return (
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>{mode === "phone" ? "💬" : "✉"}</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>{mode === "phone" ? "Check your texts" : "Check your email"}</h2>
        <p style={{ color: "#6b7280", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          If that {mode === "phone" ? "number" : "email"} is on file with us, you&apos;ll receive a sign-in link shortly.
          <br />
          It expires in 1 hour and can only be used once.
        </p>
        <button
          onClick={() => setSent(false)}
          style={{ marginTop: 20, background: "none", border: "none", color: "#2563eb", fontSize: 14, cursor: "pointer", padding: 0 }}
        >
          Try again
        </button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSubmitError(false);
    try {
      const res = await fetch("/api/v1/portal/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "phone" ? { phone } : { email }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        setSubmitError(true);
      }
    } catch {
      setSubmitError(true);
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

      {submitError && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: 14 }}>
          Something went wrong. Please try again.
        </div>
      )}

      {textEnabled && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {(["phone", "email"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                border: "1px solid #d1d5db",
                background: mode === m ? "#111" : "#fff",
                color: mode === m ? "#fff" : "#374151",
              }}
            >
              {m === "phone" ? "Text me" : "Email me"}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="portal-contact" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6, color: "#374151" }}>
          {mode === "phone" ? "Mobile number" : "Email address"}
        </label>
        <input
          id="portal-contact"
          type={mode === "phone" ? "tel" : "email"}
          value={mode === "phone" ? phone : email}
          onChange={(e) => (mode === "phone" ? setPhone(e.target.value) : setEmail(e.target.value))}
          required
          autoFocus
          autoComplete={mode === "phone" ? "tel" : "email"}
          placeholder={mode === "phone" ? "(603) 555-0142" : "you@example.com"}
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
        {loading ? "Sending…" : mode === "phone" ? "Text me a sign-in link" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
