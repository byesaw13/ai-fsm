"use client";

import { Card, SectionHeader } from "@/components/ui";
import type { Client, Job, Property } from "../hooks/useEstimateForm";
import type { LineItemRow } from "@/lib/estimates/form-helpers";
import type { PaintingEstimateResult } from "../hooks/useEstimatePricing";

interface Step4Props {
  pending: boolean;
  serviceType: "painting" | "generic";
  mode: "itemized" | "flat_rate" | "multi_option";
  selectedClient: Client | undefined;
  selectedJob: Job | undefined;
  selectedProperty: Property | undefined;
  lineItems: LineItemRow[];
  expiresAt: string;
  notes: string;
  paintingResult: PaintingEstimateResult | null;
  sendImmediately: boolean;
  setSendImmediately: (v: boolean) => void;
  reviewTotal: () => string;
}

export function Step4ReviewAndSend({
  pending, serviceType, mode,
  selectedClient, selectedJob, selectedProperty,
  lineItems, expiresAt, notes,
  paintingResult, sendImmediately, setSendImmediately,
  reviewTotal,
}: Step4Props) {
  return (
    <div className="p7-form-stack">
      <Card padding="sm" style={{ background: "var(--bg-subtle)" }}>
        <SectionHeader title="Estimate Summary" as="h3" />
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-2) var(--space-4)", fontSize: "var(--text-sm)" }}>
          <span style={{ color: "var(--fg-muted)" }}>Client</span>
          <span style={{ fontWeight: 600 }}>{selectedClient?.name ?? "—"}</span>

          {selectedJob && (
            <>
              <span style={{ color: "var(--fg-muted)" }}>Job</span>
              <span>{selectedJob.title}</span>
            </>
          )}

          {selectedProperty && (
            <>
              <span style={{ color: "var(--fg-muted)" }}>Property</span>
              <span>{selectedProperty.address}</span>
            </>
          )}

          <span style={{ color: "var(--fg-muted)" }}>Type</span>
          <span style={{ textTransform: "capitalize" }}>
            {serviceType === "painting"
              ? "Painting"
              : mode === "flat_rate"
              ? "Flat rate"
              : mode === "multi_option"
              ? "Good / Better / Best"
              : `Itemized (${lineItems.filter(r => r.description.trim()).length} item${lineItems.filter(r => r.description.trim()).length !== 1 ? "s" : ""})`}
          </span>

          <span style={{ color: "var(--fg-muted)" }}>Total</span>
          <span style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{reviewTotal()}</span>

          {expiresAt && (
            <>
              <span style={{ color: "var(--fg-muted)" }}>Expires</span>
              <span>{new Date(expiresAt).toLocaleDateString()}</span>
            </>
          )}
        </div>

        {notes.trim() && (
          <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)" }}>
            <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Client notes
            </p>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg)" }}>
              {notes}
            </p>
          </div>
        )}
      </Card>

      {serviceType === "painting" && !paintingResult && (
        <Card className="p7-card-danger" padding="sm">
          <p style={{ margin: 0 }}>
            Painting estimate is incomplete — go back to Step 2 and enter the square footage.
          </p>
        </Card>
      )}

      <div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={sendImmediately}
            onChange={(e) => setSendImmediately(e.target.checked)}
            disabled={pending}
            data-testid="send-immediately-checkbox"
          />
          <span>Send to client immediately after creating</span>
        </label>
      </div>
    </div>
  );
}
