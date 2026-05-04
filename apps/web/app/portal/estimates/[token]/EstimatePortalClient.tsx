"use client";

import { useState, useRef, useEffect } from "react";

interface LineItem {
  id: string;
  estimate_id: string;
  option_id: string | null;
  description: string;
  quantity: string;
  unit_price_cents: number;
  total_cents: number;
}

interface EstimateOption {
  id: string;
  estimate_id: string;
  label: string;
  description: string | null;
  sort_order: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  is_recommended: boolean;
  line_items: LineItem[];
}

interface Estimate {
  status: string;
  presentation_mode: "standard" | "multi_option";
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number | null;
  notes: string | null;
  expires_at: string | null;
  responded_at: string | null;
  client_approved_name: string | null;
  client_name: string;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  account_name: string;
}

interface Props {
  token: string;
  estimate: Estimate;
  lineItems: LineItem[];
  options?: EstimateOption[];
}

function cents(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

function SignaturePad({ onSave }: { onSave: (svg: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const paths = useRef<string[]>([]);
  const currentPath = useRef<string>("");

  function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const src = "touches" in e ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function start(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      drawing.current = true;
      const { x, y } = getPos(e, canvas!);
      currentPath.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
      ctx.beginPath();
      ctx.moveTo(x, y);
    }

    function move(e: MouseEvent | TouchEvent) {
      if (!drawing.current) return;
      e.preventDefault();
      const { x, y } = getPos(e, canvas!);
      currentPath.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    function end() {
      if (!drawing.current) return;
      drawing.current = false;
      paths.current.push(currentPath.current);
      currentPath.current = "";
      const w = canvas!.width;
      const h = canvas!.height;
      const pathsStr = paths.current.map((d) => `<path d="${d}" />`).join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pathsStr}</svg>`;
      onSave(svg);
    }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, [onSave]);

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paths.current = [];
    currentPath.current = "";
    onSave("");
  }

  return (
    <div>
      <div style={{ border: "1px solid #d1d5db", borderRadius: 6, background: "#fafafa", position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={480}
          height={120}
          style={{ display: "block", width: "100%", height: 120, cursor: "crosshair", touchAction: "none" }}
        />
        <div style={{ position: "absolute", bottom: 6, left: 8, fontSize: 11, color: "#9ca3af", pointerEvents: "none" }}>
          Sign above
        </div>
      </div>
      <button type="button" onClick={clear} style={{ marginTop: 4, fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        Clear signature
      </button>
    </div>
  );
}

export function EstimatePortalClient({ token, estimate, lineItems, options = [] }: Props) {
  const [status, setStatus] = useState(estimate.status);
  const [approvedName, setApprovedName] = useState(estimate.client_approved_name ?? "");
  const [name, setName] = useState("");
  const [signatureSvg, setSignatureSvg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState<"approve" | "decline" | null>(null);

  const canRespond = status === "sent";
  const isExpired = estimate.expires_at && new Date(estimate.expires_at) < new Date();

  async function respond(action: "approve" | "decline") {
    if (action === "approve" && !name.trim()) {
      setError("Please enter your full name to approve.");
      return;
    }
    if (action === "approve" && !signatureSvg) {
      setError("Please sign above before approving.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/estimates/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name: name.trim() || undefined, signature_svg: signatureSvg || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      setStatus(data.status);
      setApprovedName(name);
      setShowForm(null);
    } finally {
      setSubmitting(false);
    }
  }

  const propertyLine = [estimate.property_address, estimate.property_city, estimate.property_state, estimate.property_zip]
    .filter(Boolean).join(", ");

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "24px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>{estimate.account_name}</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Estimate</h1>
          {propertyLine && <div style={{ color: "#6b7280", marginTop: 4 }}>{propertyLine}</div>}
          <div style={{ color: "#6b7280", marginTop: 2 }}>Prepared for: {estimate.client_name}</div>
        </div>

        {/* Status banner */}
        {status === "approved" && (
          <div style={{ background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 8, padding: "12px 16px", marginBottom: 24, color: "#065f46" }}>
            Approved by {approvedName || estimate.client_approved_name}{estimate.responded_at ? ` on ${new Date(estimate.responded_at).toLocaleDateString()}` : ""}
          </div>
        )}
        {status === "declined" && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 24, color: "#991b1b" }}>
            Declined
          </div>
        )}
        {status === "expired" || isExpired ? (
          <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "12px 16px", marginBottom: 24, color: "#92400e" }}>
            This estimate has expired. Please contact us for an updated quote.
          </div>
        ) : null}

        {/* Options (multi_option mode) */}
        {estimate.presentation_mode === "multi_option" && options.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 16, marginBottom: 24 }}>
            {options.map((option) => (
              <div
                key={option.id}
                style={{
                  background: "#fff",
                  border: option.is_recommended ? "2px solid #2563eb" : "1px solid #e5e7eb",
                  borderRadius: 8,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {option.is_recommended && (
                  <div style={{
                    background: "#2563eb", color: "#fff", textAlign: "center",
                    padding: "4px 0", fontSize: 12, fontWeight: 600,
                  }}>
                    Recommended
                  </div>
                )}
                <div style={{ padding: "16px 16px 8px" }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>{option.label}</h2>
                  {option.description && (
                    <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>{option.description}</p>
                  )}
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <tbody>
                    {option.line_items.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px 16px" }}>{item.description}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 500, whiteSpace: "nowrap" }}>{cents(item.total_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb" }}>
                  {option.tax_cents > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 2 }}>
                      <span>Tax</span><span>{cents(option.tax_cents)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18 }}>
                    <span>Total</span><span>{cents(option.total_cents)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Line items (standard mode) */}
        {estimate.presentation_mode !== "multi_option" && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Description</th>
                <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Qty</th>
                <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Unit</th>
                <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 16px" }}>{item.description}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", color: "#6b7280" }}>{item.quantity}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", color: "#6b7280" }}>{cents(item.unit_price_cents)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500 }}>{cents(item.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ display: "flex", gap: 32, color: "#6b7280", fontSize: 13 }}>
              <span>Subtotal</span><span>{cents(estimate.subtotal_cents)}</span>
            </div>
            {estimate.tax_cents > 0 && (
              <div style={{ display: "flex", gap: 32, color: "#6b7280", fontSize: 13 }}>
                <span>Tax</span><span>{cents(estimate.tax_cents)}</span>
              </div>
            )}
            {estimate.deposit_cents != null && estimate.deposit_cents > 0 && (
              <div style={{ display: "flex", gap: 32, color: "#6b7280", fontSize: 13 }}>
                <span>Deposit due</span><span>{cents(estimate.deposit_cents)}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 32, fontWeight: 700, fontSize: 16, marginTop: 4 }}>
              <span>Total</span><span>{cents(estimate.total_cents)}</span>
            </div>
          </div>
        </div>
        )}

        {/* Notes */}
        {estimate.notes && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>NOTES</div>
            <div style={{ whiteSpace: "pre-wrap", color: "#374151" }}>{estimate.notes}</div>
          </div>
        )}

        {/* Expiry */}
        {estimate.expires_at && status === "sent" && !isExpired && (
          <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
            This estimate expires on {new Date(estimate.expires_at).toLocaleDateString()}.
          </div>
        )}

        {/* Action buttons */}
        {canRespond && !isExpired && (
          <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
            <button
              type="button"
              onClick={() => { setShowForm("approve"); setError(""); }}
              style={{ flex: 1, padding: "12px 24px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: "pointer" }}
            >
              Approve Estimate
            </button>
            <button
              type="button"
              onClick={() => { setShowForm("decline"); setError(""); }}
              style={{ padding: "12px 24px", background: "#fff", color: "#dc2626", border: "1px solid #dc2626", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer" }}
            >
              Decline
            </button>
          </div>
        )}

        {/* Approval form */}
        {showForm === "approve" && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Approve Estimate</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Full name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 15, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Signature *</label>
              <SignaturePad onSave={setSignatureSvg} />
            </div>
            {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => respond("approve")}
                disabled={submitting}
                style={{ padding: "10px 20px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: submitting ? "wait" : "pointer" }}
              >
                {submitting ? "Submitting…" : "Confirm Approval"}
              </button>
              <button type="button" onClick={() => setShowForm(null)} style={{ padding: "10px 16px", background: "none", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Decline form */}
        {showForm === "decline" && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Decline Estimate</h3>
            <p style={{ color: "#6b7280", margin: "0 0 16px" }}>Are you sure you want to decline this estimate? The contractor will be notified.</p>
            {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => respond("decline")}
                disabled={submitting}
                style={{ padding: "10px 20px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: submitting ? "wait" : "pointer" }}
              >
                {submitting ? "Submitting…" : "Decline Estimate"}
              </button>
              <button type="button" onClick={() => setShowForm(null)} style={{ padding: "10px 16px", background: "none", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
