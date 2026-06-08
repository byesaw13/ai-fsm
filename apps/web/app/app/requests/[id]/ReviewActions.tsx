"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton, Textarea } from "@/components/ui";
import { getRequestGuidance } from "../request-guidance";

type ReviewStatus = "needs_info" | "duplicate" | "reviewed" | "cancelled";
type PricingMode = "flat_rate" | "hourly_internal";
type PricingChoice = PricingMode | null;

const REVIEW_BUTTONS: Record<ReviewStatus, { label: string; variant: "primary" | "secondary" | "ghost" | "danger" }> = {
  reviewed: { label: "Mark Reviewed", variant: "primary" },
  needs_info: { label: "Needs Info", variant: "secondary" },
  duplicate: { label: "Duplicate", variant: "ghost" },
  cancelled: { label: "Close Request", variant: "danger" },
};

const PRICING_LABELS: Record<PricingMode, string> = {
  flat_rate: "Fixed Bid",
  hourly_internal: "Time and Materials",
};

const PRICING_HELPER: Record<PricingMode, string> = {
  flat_rate: "Walkthrough first, then estimate, approval, schedule, and materials.",
  hourly_internal: "Open-ended or small repair work billed from actual time and materials.",
};

interface Props {
  bookingId: string;
  currentStatus: string;
  initialNotes: string | null;
  initialPricingMode: PricingChoice;
  jobId: string | null;
  clientEmail: string | null;
  clientId: string | null;
  propertyId: string | null;
  visitId: string | null;
  routingPath: string | null;
  preferredDate: string;
  preferredTimeSlot: string | null;
}

export function ReviewActions({ bookingId, currentStatus, initialNotes, initialPricingMode, jobId, clientEmail, clientId, propertyId, visitId, routingPath, preferredDate, preferredTimeSlot }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [pricingMode, setPricingMode] = useState<PricingChoice>(initialPricingMode);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWalkthroughForm, setShowWalkthroughForm] = useState(false);
  const [intakeEmail, setIntakeEmail] = useState(clientEmail ?? "");
  const [intakeSent, setIntakeSent] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [visitDate, setVisitDate] = useState(preferredDate ?? new Date().toISOString().slice(0, 10));
  const [visitSlot, setVisitSlot] = useState<string>(preferredTimeSlot ?? "morning");

  const guidance = getRequestGuidance({
    status: currentStatus,
    pricing_mode: pricingMode,
    routing_path: routingPath as "site_visit" | "remote_estimate" | "pending" | null,
    job_id: jobId,
    visit_id: visitId,
    walkthrough_score: null,
  });

  const isFinal = currentStatus === "converted" || currentStatus === "cancelled";

  async function patchRequest(body: Record<string, unknown>) {
    const res = await fetch(`/api/v1/booking-requests/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }

  async function handlePricingModeChange(nextMode: PricingMode) {
    if (nextMode === pricingMode) return;
    setPending(`pricing-${nextMode}`);
    setError(null);
    try {
      const { res, json } = await patchRequest({ pricing_mode: nextMode });
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to update pricing mode");
        return;
      }
      setPricingMode(nextMode);
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(null);
    }
  }

  async function handleSendIntake() {
    setPending("intake");
    setIntakeError(null);
    try {
      const body: Record<string, string> = {};
      if (intakeEmail && !clientEmail) body.email = intakeEmail;
      const res = await fetch(`/api/v1/booking-requests/${bookingId}/send-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { error?: { message?: string } };
      if (!res.ok && res.status !== 207) {
        setIntakeError(json.error?.message ?? "Failed to send intake form.");
        return;
      }
      setIntakeSent(true);
      router.refresh();
    } catch {
      setIntakeError("Network error. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function handleStatus(status: ReviewStatus) {
    setPending(status);
    setError(null);
    try {
      const { res, json } = await patchRequest({ status, review_notes: notes || null });
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to update");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(null);
    }
  }

  async function handleRepair() {
    setPending("repair");
    setError(null);
    try {
      const res = await fetch(`/api/v1/booking-requests/${bookingId}/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error?.message ?? "Failed to create job");
        return;
      }
      if (d.data?.jobId) {
        router.push(`/app/jobs/${d.data.jobId}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(null);
    }
  }

  async function handleConvert() {
    setPending("convert");
    setError(null);
    try {
      const res = await fetch(`/api/v1/booking-requests/${bookingId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferred_date: visitDate,
          preferred_time_slot: visitSlot,
          review_notes: notes || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error?.message ?? "Failed to convert");
        return;
      }
      if (d.data?.visit_id) {
        router.push(`/app/visits/${d.data.visit_id}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(null);
    }
  }

  async function saveNotes() {
    setPending("notes");
    setError(null);
    try {
      const { res, json } = await patchRequest({ review_notes: notes || null });
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to save notes");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(null);
    }
  }

  const primaryAction = (() => {
    switch (guidance.primaryActionKind) {
      case "create_estimate": {
        const params = new URLSearchParams({ pricing_mode: "flat_rate" });
        if (clientId) params.set("client_id", clientId);
        if (propertyId) params.set("property_id", propertyId);
        params.set("booking_request_id", bookingId);
        return <LinkButton href={`/app/estimates/new?${params.toString()}`} variant="primary" size="sm">Create Estimate →</LinkButton>;
      }
      case "create_job":
        return <Button variant="primary" onClick={handleRepair} loading={pending === "repair"} disabled={!!pending} size="sm">Create Job →</Button>;
      case "schedule_walkthrough":
        return !showWalkthroughForm
          ? <Button variant="primary" onClick={() => setShowWalkthroughForm(true)} disabled={!!pending} size="sm">Schedule Walkthrough →</Button>
          : null;
      case "close_request":
        return <Button variant="danger" onClick={() => handleStatus("cancelled")} loading={pending === "cancelled"} disabled={!!pending || isFinal} size="sm">Close Request →</Button>;
      default:
        return null;
    }
  })();

  return (
    <div className="p7-form-stack">
      {error && <div className="p7-card-danger" role="alert">{error}</div>}

      <Textarea
        id="review_notes"
        label="Review Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Duplicate of #…, needs address clarification, out of service area…"
        rows={3}
        disabled={!!pending || isFinal}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-muted)" }}>
              Request Type
            </p>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{pricingMode ? PRICING_LABELS[pricingMode] : "Needs Review"}</span>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {(["flat_rate", "hourly_internal"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={pricingMode === mode ? "primary" : "secondary"}
                size="sm"
                onClick={() => handlePricingModeChange(mode)}
                loading={pending === `pricing-${mode}`}
                disabled={!!pending || isFinal}
              >
                {PRICING_LABELS[mode]}
              </Button>
            ))}
          </div>
          <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            {pricingMode ? PRICING_HELPER[pricingMode] : "Choose Fixed Bid for estimated project work or Time and Materials for open-ended actuals."}
          </p>
        </div>

        <div style={{ padding: "var(--space-3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-subtle)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-muted)" }}>
            Recommended Next Step
          </p>
          <div style={{ marginTop: "var(--space-2)", display: "grid", gap: "var(--space-1)" }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>{guidance.currentStateLabel}</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>{guidance.currentStateDetail}</div>
            <div style={{ fontSize: "var(--text-sm)" }}>
              <strong>{guidance.recommendedLabel}</strong> to create the next {guidance.destinationRecord.toLowerCase()}.
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{guidance.recommendedDetail}</div>
          </div>

          <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
            {primaryAction}
            {!primaryAction && guidance.followUpKind && guidance.followUpHref && (
              <LinkButton href={guidance.followUpHref} variant="primary" size="sm">
                {guidance.followUpKind === "view_visit" ? "Open Walkthrough →" : "Open Job →"}
              </LinkButton>
            )}
          </div>

          {guidance.primaryActionKind === "schedule_walkthrough" && showWalkthroughForm && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)", padding: "var(--space-3)", background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
              <strong style={{ fontSize: "var(--text-sm)" }}>Confirm Walkthrough Date</strong>
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <div className="form-group" style={{ flex: "1 1 160px", margin: 0 }}>
                  <label htmlFor="visit-date" style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Date</label>
                  <input id="visit-date" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} disabled={!!pending} style={{ width: "100%" }} />
                </div>
                <div className="form-group" style={{ flex: "1 1 140px", margin: 0 }}>
                  <label htmlFor="visit-slot" style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Time</label>
                  <select id="visit-slot" value={visitSlot} onChange={(e) => setVisitSlot(e.target.value)} disabled={!!pending} style={{ width: "100%" }}>
                    <option value="morning">Morning (9am–11am)</option>
                    <option value="afternoon">Afternoon (1pm–3pm)</option>
                    <option value="evening">Evening (4pm–6pm)</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <Button variant="primary" onClick={handleConvert} loading={pending === "convert"} disabled={!!pending || !visitDate} size="sm">
                  Confirm Walkthrough
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowWalkthroughForm(false)} disabled={!!pending}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {!isFinal && (
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {(["reviewed", "needs_info", "duplicate", "cancelled"] as ReviewStatus[]).map((s) => (
              <Button
                key={s}
                variant={REVIEW_BUTTONS[s].variant}
                onClick={() => handleStatus(s)}
                loading={pending === s}
                disabled={!!pending || currentStatus === s}
                size="sm"
              >
                {REVIEW_BUTTONS[s].label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={saveNotes} loading={pending === "notes"} disabled={!!pending}>
              Save Notes Only
            </Button>
          </div>
        )}

        <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-3)", borderTop: "1px dashed var(--border)" }}>
          <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)" }}>
            Send intake form to client
          </p>
          {intakeSent ? (
            <p style={{ fontSize: "var(--text-xs)", color: "#16a34a", margin: 0 }}>✓ Intake form sent successfully.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {!clientEmail && (
                <div>
                  <label style={{ fontSize: "var(--text-xs)", display: "block", marginBottom: 4 }}>Client email (required)</label>
                  <input
                    type="email"
                    value={intakeEmail}
                    onChange={(e) => setIntakeEmail(e.target.value)}
                    placeholder="client@email.com"
                    style={{ width: "100%", padding: "6px 8px", fontSize: "var(--text-xs)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", boxSizing: "border-box" }}
                  />
                </div>
              )}
              {clientEmail && (
                <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", margin: 0 }}>
                  Will send to: {clientEmail}
                </p>
              )}
              {intakeError && <p style={{ fontSize: "var(--text-xs)", color: "#dc2626", margin: 0 }}>{intakeError}</p>}
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <Button variant="secondary" size="sm" onClick={handleSendIntake} loading={pending === "intake"} disabled={!!pending || (!clientEmail && !intakeEmail)}>
                  Send Intake Form
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isFinal && (
        <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          This request is {currentStatus} and cannot be changed.
        </p>
      )}
    </div>
  );
}
