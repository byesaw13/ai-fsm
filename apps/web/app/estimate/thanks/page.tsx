interface PageProps {
  searchParams: Promise<{ action?: string }>;
}

export default async function EstimateThanksPage({ searchParams }: PageProps) {
  const { action } = await searchParams;

  const isApproved = action === "approve";
  const isDeclined = action === "decline";

  const icon = isApproved ? "✓" : isDeclined ? "✗" : "⚠";
  const iconColor = isApproved ? "#16a34a" : isDeclined ? "#dc2626" : "#d97706";
  const title = isApproved ? "Estimate Approved" : isDeclined ? "Estimate Declined" : "Something went wrong";
  const body = isApproved
    ? "Thank you for approving the estimate. We'll be in touch shortly to confirm next steps."
    : isDeclined
    ? "Thank you for letting us know. We've recorded your response and will follow up if needed."
    : "This link may have expired or already been used. Please contact us directly if you need assistance.";

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px", background: "#f4f4f5" }}>
      <div style={{ maxWidth: 480, width: "100%", background: "#fff", borderRadius: 12, padding: "48px 40px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <div style={{ fontSize: 48, marginBottom: 16, lineHeight: 1, color: iconColor }}>
          {icon}
        </div>
        <h1 style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
          {title}
        </h1>
        <p style={{ margin: 0, color: "#52525b", fontSize: 15, lineHeight: 1.6 }}>
          {body}
        </p>
        <p style={{ margin: "32px 0 0", fontSize: 13, color: "#a1a1aa" }}>
          Dovetails Services LLC
        </p>
      </div>
    </div>
  );
}
