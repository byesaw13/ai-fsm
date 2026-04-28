import { jwtVerify } from "jose";
import { getEnv } from "@/lib/env";

interface PageProps {
  searchParams: Promise<{ action?: string; token?: string }>;
}

/**
 * Public confirmation page for estimate approve/decline.
 *
 * Email links land here (GET). The page shows a confirmation prompt and
 * a form that POSTs to the API route to do the actual state mutation.
 * This prevents security scanners and link-preview bots from accidentally
 * triggering state changes by prefetching GET URLs.
 */
export default async function EstimateRespondPage({ searchParams }: PageProps) {
  const { action, token } = await searchParams;

  const isValidAction = action === "approve" || action === "decline";

  let estimateId: string | null = null;
  let tokenValid = false;

  if (token && isValidAction) {
    try {
      const secret = new TextEncoder().encode(getEnv().AUTH_SECRET);
      const { payload } = await jwtVerify(token, secret);
      if (
        typeof payload.estimateId === "string" &&
        payload.action === action
      ) {
        estimateId = payload.estimateId;
        tokenValid = true;
      }
    } catch {
      // invalid or expired token
    }
  }

  const isApprove = action === "approve";
  const actionLabel = isApprove ? "Approve Estimate" : "Decline Estimate";
  const accentColor = isApprove ? "#16a34a" : "#dc2626";

  if (!tokenValid || !estimateId) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px", background: "#f4f4f5" }}>
        <div style={{ maxWidth: 480, width: "100%", background: "#fff", borderRadius: 12, padding: "48px 40px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 48, marginBottom: 16, color: "#d97706" }}>⚠</div>
          <h1 style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 700, color: "#0f172a" }}>Link expired or invalid</h1>
          <p style={{ margin: 0, color: "#52525b", fontSize: 15 }}>
            This link may have already been used or has expired. Please contact us if you need assistance.
          </p>
          <p style={{ margin: "32px 0 0", fontSize: 13, color: "#a1a1aa" }}>Dovetails Services LLC</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px", background: "#f4f4f5" }}>
      <div style={{ maxWidth: 480, width: "100%", background: "#fff", borderRadius: 12, padding: "48px 40px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <div style={{ fontSize: 48, marginBottom: 16, color: accentColor }}>
          {isApprove ? "✓" : "✗"}
        </div>
        <h1 style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
          {isApprove ? "Approve this estimate?" : "Decline this estimate?"}
        </h1>
        <p style={{ margin: "0 0 32px", color: "#52525b", fontSize: 15 }}>
          {isApprove
            ? "Click the button below to confirm your approval. We'll be in touch shortly after."
            : "Click the button below to decline. We'll follow up if needed."}
        </p>
        <form method="POST" action={`/api/v1/estimates/${estimateId}/respond`}>
          <input type="hidden" name="action" value={action} />
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            style={{
              display: "inline-block", padding: "14px 32px", borderRadius: 8,
              background: accentColor, color: "#fff", fontWeight: 700,
              fontSize: 16, border: "none", cursor: "pointer",
            }}
          >
            {actionLabel}
          </button>
        </form>
        <p style={{ margin: "32px 0 0", fontSize: 13, color: "#a1a1aa" }}>Dovetails Services LLC</p>
      </div>
    </div>
  );
}
