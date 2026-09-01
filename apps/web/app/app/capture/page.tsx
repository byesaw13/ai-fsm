import { getSession } from "@/lib/auth/session";
import { CaptureRecorder } from "./CaptureRecorder";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Capture",
};

export default async function CapturePage() {
  const session = await getSession();
  if (session?.role !== "owner" && session?.role !== "admin") {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-3)",
          padding: "var(--space-6)",
          background: "var(--bg)",
          color: "var(--fg)",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "var(--text-2xl)" }}>Capture</h1>
        <p style={{ margin: 0, color: "var(--fg-secondary)" }}>
          Capture is available to owner and admin only.
        </p>
      </main>
    );
  }

  return <CaptureRecorder />;
}
