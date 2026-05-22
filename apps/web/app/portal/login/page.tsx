import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = { title: "Portal Login" };

export default function PortalLoginPage() {
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
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 8 }}>
            Dovetails Services
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#111" }}>Account Portal</h1>
          <p style={{ color: "#6b7280", marginTop: 8, fontSize: 14 }}>
            Enter your email and we&apos;ll send you a login link.
          </p>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 28,
          }}
        >
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
