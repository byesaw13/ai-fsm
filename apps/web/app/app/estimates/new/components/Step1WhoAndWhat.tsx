"use client";

import { Input, Select, SectionHeader } from "@/components/ui";
import { InlineClientForm } from "../InlineClientForm";
import { InlineJobForm } from "../InlineJobForm";
import { InlinePropertyForm } from "../InlinePropertyForm";
import type { Client, Job, Property } from "../hooks/useEstimateForm";

interface Step1Props {
  pending: boolean;
  serviceType: "painting" | "generic";
  setServiceType: (v: "painting" | "generic") => void;
  clientId: string;
  setClientId: (v: string) => void;
  jobId: string;
  setJobId: (v: string) => void;
  propertyId: string;
  setPropertyId: (v: string) => void;
  expiresAt: string;
  setExpiresAt: (v: string) => void;
  clientList: Client[];
  filteredJobs: Job[];
  filteredProperties: Property[];
  inlineForm: "client" | "job" | "property" | null;
  setInlineForm: (v: "client" | "job" | "property" | null) => void;
  handleClientCreated: (client: { id: string; name: string }) => void;
  handleJobCreated: (job: { id: string; title: string; client_id: string }) => void;
  handlePropertyCreated: (property: { id: string; address: string; client_id: string }) => void;
  reviewTotal: () => string;
}

export function Step1WhoAndWhat({
  pending, serviceType, setServiceType,
  clientId, setClientId, jobId, setJobId, propertyId, setPropertyId,
  expiresAt, setExpiresAt,
  clientList, filteredJobs, filteredProperties,
  inlineForm, setInlineForm,
  handleClientCreated, handleJobCreated, handlePropertyCreated,
  reviewTotal,
}: Step1Props) {
  return (
    <div className="p7-form-stack">
      {/* Service type toggle */}
      <div>
        <SectionHeader title="Service Type" as="h3" />
        <div
          style={{
            display: "flex",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
            width: "fit-content",
          }}
        >
          {(["generic", "painting"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setServiceType(t)}
              disabled={pending}
              style={{
                padding: "var(--space-1) var(--space-4)",
                background: serviceType === t ? "var(--accent)" : "transparent",
                color: serviceType === t ? "#fff" : "var(--fg-muted)",
                border: "none",
                cursor: pending ? "default" : "pointer",
                fontSize: "var(--text-sm)",
                fontWeight: serviceType === t ? 600 : 400,
                lineHeight: 1.4,
              }}
            >
              {t === "painting" ? "Painting" : "General"}
            </button>
          ))}
        </div>
        {serviceType === "painting" && (
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            Painting estimator — fields auto-fill from a job description.
          </p>
        )}
      </div>

      {/* Client / Job / Property */}
      <div className="p7-form-grid p7-form-grid-2">
        <div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <Select
                id="client_id"
                label="Client"
                required
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setJobId("");
                  setPropertyId("");
                  setInlineForm(null);
                }}
                disabled={pending}
                options={clientList.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Select a client"
              />
            </div>
            <button
              type="button"
              className="p7-btn p7-btn-secondary p7-btn-sm"
              onClick={() => setInlineForm(inlineForm === "client" ? null : "client")}
              disabled={pending}
              style={{ flexShrink: 0, marginBottom: "1px" }}
            >
              + New
            </button>
          </div>
          {inlineForm === "client" && (
            <InlineClientForm
              onCreated={handleClientCreated}
              onCancel={() => setInlineForm(null)}
            />
          )}
        </div>

        <div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <Select
                id="job_id"
                label="Job (optional)"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                disabled={pending || !clientId}
                options={filteredJobs.map((j) => ({ value: j.id, label: j.title }))}
                placeholder="None"
                hint={
                  clientId && filteredJobs.length === 0
                    ? "No open jobs for this client."
                    : undefined
                }
              />
            </div>
            {clientId && (
              <button
                type="button"
                className="p7-btn p7-btn-secondary p7-btn-sm"
                onClick={() => setInlineForm(inlineForm === "job" ? null : "job")}
                disabled={pending}
                style={{ flexShrink: 0, marginBottom: "1px" }}
              >
                + New
              </button>
            )}
          </div>
          {inlineForm === "job" && clientId && (
            <InlineJobForm
              clientId={clientId}
              onCreated={handleJobCreated}
              onCancel={() => setInlineForm(null)}
            />
          )}
        </div>

        <div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <Select
                id="property_id"
                label="Property (optional)"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                disabled={pending || !clientId}
                options={filteredProperties.map((p) => ({ value: p.id, label: p.address }))}
                placeholder="None"
                hint={
                  clientId && filteredProperties.length === 0
                    ? "No properties for this client."
                    : undefined
                }
              />
            </div>
            {clientId && (
              <button
                type="button"
                className="p7-btn p7-btn-secondary p7-btn-sm"
                onClick={() => setInlineForm(inlineForm === "property" ? null : "property")}
                disabled={pending}
                style={{ flexShrink: 0, marginBottom: "1px" }}
              >
                + New
              </button>
            )}
          </div>
          {inlineForm === "property" && clientId && (
            <InlinePropertyForm
              clientId={clientId}
              onCreated={handlePropertyCreated}
              onCancel={() => setInlineForm(null)}
            />
          )}
        </div>

        <Input
          id="expires_at"
          label="Expires (optional)"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          disabled={pending}
        />
      </div>

      {/* Live preview */}
      <div
        data-testid="estimate-live-preview"
        style={{
          padding: "var(--space-3)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          background: "var(--surface-muted, var(--surface))",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            Estimate Preview
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "var(--space-1)" }}>
            {reviewTotal() === "—"
              ? "Add pricing on the next step — the total will appear here."
              : "Updates live as you adjust pricing on the next step."}
          </div>
        </div>
        <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--fg)" }}>
          {reviewTotal()}
        </div>
      </div>
    </div>
  );
}
