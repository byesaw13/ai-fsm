"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ConfirmDialog, Input, Modal, SectionHeader, Select } from "@/components/ui";
import {
  deriveLocationSource,
  formatPropertyOption,
  locationSourceLabel,
  type LocationSource,
} from "@/lib/documents/location-source";

type EntityType = "invoice" | "estimate";
type LocationMode = "job" | "property" | "client_billing";
type EditSegment = "client" | "location" | null;

interface ClientResult {
  id: string;
  name: string;
}

interface JobOption {
  id: string;
  title: string;
  property_id: string | null;
  property_address?: string | null;
}

interface PropertyOption {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface DocumentClientLocationCardProps {
  entityType: EntityType;
  entityId: string;
  canEdit: boolean;
  clientId: string;
  clientName: string | null;
  clientEmail?: string | null;
  jobId: string | null;
  jobTitle: string | null;
  propertyId: string | null;
  documentPropertyId: string | null;
  jobPropertyId: string | null;
  estimatePropertyId?: string | null;
  resolvedPropertyId: string | null;
  serviceLocation: string;
  clientBillingAddress?: string | null;
}

const segmentButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
  width: "100%",
};

function segmentLabel(canEdit: boolean, missing: boolean): CSSProperties {
  return {
    fontWeight: 600,
    color: missing ? "var(--color-warning, #b45309)" : canEdit ? "var(--accent)" : "inherit",
    textDecoration: canEdit ? "underline" : "none",
    textUnderlineOffset: "2px",
  };
}

export function DocumentClientLocationCard({
  entityType,
  entityId,
  canEdit,
  clientId,
  clientName,
  clientEmail,
  jobId,
  jobTitle,
  propertyId,
  documentPropertyId,
  jobPropertyId,
  estimatePropertyId,
  resolvedPropertyId,
  serviceLocation,
  clientBillingAddress,
}: DocumentClientLocationCardProps) {
  const router = useRouter();
  const [segment, setSegment] = useState<EditSegment>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientQuery, setClientQuery] = useState(clientName ?? "");
  const [clientResults, setClientResults] = useState<ClientResult[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(
    clientId && clientName ? { id: clientId, name: clientName } : null,
  );
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [locationMode, setLocationMode] = useState<LocationMode>("property");
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState(jobId ?? "");
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyId ?? "");
  const [addProperty, setAddProperty] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newZip, setNewZip] = useState("");

  const locationMissing = serviceLocation === "Address not on file";
  const locationSource: LocationSource = deriveLocationSource({
    document_property_id: documentPropertyId,
    job_property_id: jobPropertyId,
    estimate_property_id: estimatePropertyId,
    resolved_property_id: resolvedPropertyId,
    service_location: serviceLocation,
  });

  const apiBase = `/api/v1/${entityType}s/${entityId}/document-links`;

  const searchClients = useCallback((q: string) => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!q.trim()) {
      setClientResults([]);
      setShowClientDropdown(false);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/clients?q=${encodeURIComponent(q)}&limit=8`);
        const data = (await res.json()) as { data?: ClientResult[] };
        setClientResults(data.data ?? []);
        setShowClientDropdown(true);
      } catch {
        setClientResults([]);
      }
    }, 250);
  }, []);

  const loadJobsAndProperties = useCallback(async (forClientId: string) => {
    const [jobsRes, propsRes] = await Promise.all([
      fetch(`/api/v1/jobs?client_id=${encodeURIComponent(forClientId)}&limit=100`),
      fetch(`/api/v1/properties?client_id=${encodeURIComponent(forClientId)}&limit=100`),
    ]);
    const jobsData = (await jobsRes.json()) as { data?: JobOption[] };
    const propsData = (await propsRes.json()) as { data?: PropertyOption[] };
    setJobs(jobsData.data ?? []);
    setProperties(propsData.data ?? []);
  }, []);

  useEffect(() => {
    if (segment !== "location") return;
    const forClient = selectedClient?.id ?? clientId;
    void loadJobsAndProperties(forClient);
  }, [segment, selectedClient?.id, clientId, loadJobsAndProperties]);

  function openClientEditor() {
    if (!canEdit) return;
    setError(null);
    setClientQuery(clientName ?? "");
    setSelectedClient(clientId && clientName ? { id: clientId, name: clientName } : null);
    setSegment("client");
  }

  function openLocationEditor() {
    if (!canEdit) return;
    setError(null);
    setSelectedJobId(jobId ?? "");
    setSelectedPropertyId(propertyId ?? "");
    setAddProperty(false);
    setNewAddress("");
    setNewCity("");
    setNewState("");
    setNewZip("");
    if (jobId && jobPropertyId) {
      setLocationMode("job");
    } else if (propertyId) {
      setLocationMode("property");
    } else if (clientBillingAddress) {
      setLocationMode("client_billing");
    } else {
      setLocationMode("property");
    }
    setSegment("location");
  }

  function closeEditor() {
    setSegment(null);
    setError(null);
    setShowClientDropdown(false);
  }

  function previewLocation(): string {
    if (locationMode === "job") {
      const job = jobs.find((j) => j.id === selectedJobId);
      if (!job) return "Select a project";
      return formatPropertyOption(job.property_address ?? null, null, null, null, job.title);
    }
    if (locationMode === "property") {
      if (addProperty) {
        return formatPropertyOption(newAddress, newCity, newState, newZip) || "Enter an address";
      }
      const prop = properties.find((p) => p.id === selectedPropertyId);
      if (!prop) return "Select a property";
      return formatPropertyOption(prop.address, prop.city, prop.state, prop.zip);
    }
    return clientBillingAddress || "Client billing address (not on file)";
  }

  function buildPayload(): Record<string, unknown> {
    if (segment === "client") {
      if (!selectedClient || selectedClient.id === clientId) {
        throw new Error("Choose a different client");
      }
      return { client_id: selectedClient.id };
    }

    const payload: Record<string, unknown> = { location_mode: locationMode };
    if (locationMode === "job") {
      if (!selectedJobId) throw new Error("Select a project");
      payload.job_id = selectedJobId;
    } else if (locationMode === "property") {
      if (addProperty) {
        if (!newAddress.trim()) throw new Error("Enter a street address");
        payload.new_property = {
          address: newAddress.trim(),
          city: newCity.trim(),
          state: newState.trim(),
          zip: newZip.trim(),
        };
      } else {
        if (!selectedPropertyId) throw new Error("Select a property");
        payload.property_id = selectedPropertyId;
      }
    }
    return payload;
  }

  function confirmBody(): string {
    if (segment === "client" && selectedClient) {
      return `Change client from "${clientName ?? "—"}" to "${selectedClient.name}"? Linked project and property may be cleared unless you set them again.`;
    }
    return `Change service location from "${serviceLocation}" to "${previewLocation()}"?`;
  }

  function requestConfirm() {
    try {
      buildPayload();
      setError(null);
      setConfirmOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid selection");
    }
  }

  async function applyChange() {
    setPending(true);
    setError(null);
    try {
      const payload = buildPayload();
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to save");
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      closeEditor();
      router.refresh();
    } catch {
      setError("Network error — please try again");
      setConfirmOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Card>
        <SectionHeader title="Client & Location" />
        <dl className="p7-detail-list" style={{ fontSize: "var(--text-sm)" }}>
          <div className="p7-detail-row">
            <dt>Client</dt>
            <dd>
              {canEdit ? (
                <button
                  type="button"
                  onClick={openClientEditor}
                  style={segmentButtonStyle}
                  data-testid="document-client-segment"
                >
                  <span style={segmentLabel(canEdit, !clientName)}>
                    {clientName ?? "Not set — tap to link"}
                  </span>
                </button>
              ) : (
                <span style={{ fontWeight: 600 }}>{clientName ?? "—"}</span>
              )}
            </dd>
          </div>
          {clientEmail && (
            <div className="p7-detail-row">
              <dt>Email</dt>
              <dd>{clientEmail}</dd>
            </div>
          )}
          <div className="p7-detail-row">
            <dt>Service location</dt>
            <dd>
              {canEdit ? (
                <button
                  type="button"
                  onClick={openLocationEditor}
                  style={segmentButtonStyle}
                  data-testid="document-location-segment"
                >
                  <span style={segmentLabel(canEdit, locationMissing)}>{serviceLocation}</span>
                </button>
              ) : (
                serviceLocation
              )}
            </dd>
          </div>
          <div className="p7-detail-row">
            <dt>Source</dt>
            <dd style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
              {locationSourceLabel(locationSource)}
              {jobTitle && locationSource === "job" ? ` · ${jobTitle}` : null}
            </dd>
          </div>
        </dl>
        {canEdit && (
          <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            Tap client or service location to link or correct.
          </p>
        )}
      </Card>

      <Modal
        open={segment === "client"}
        onClose={closeEditor}
        title="Link client"
        footer={
          <>
            <Button variant="secondary" onClick={closeEditor} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={requestConfirm} disabled={!selectedClient || selectedClient.id === clientId}>
              Review change
            </Button>
          </>
        }
      >
        <div style={{ position: "relative" }}>
          <Input
            id="doc-client-search"
            label="Client"
            value={clientQuery}
            onChange={(e) => {
              setClientQuery(e.target.value);
              setSelectedClient(null);
              searchClients(e.target.value);
            }}
            placeholder="Search by name, email, or phone"
            autoComplete="off"
          />
          {showClientDropdown && clientResults.length > 0 && (
            <ul
              style={{
                position: "absolute",
                zIndex: 10,
                left: 0,
                right: 0,
                margin: "4px 0 0",
                padding: 0,
                listStyle: "none",
                background: "var(--bg-elevated, #fff)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                maxHeight: 220,
                overflowY: "auto",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              }}
            >
              {clientResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClient(c);
                      setClientQuery(c.name);
                      setShowClientDropdown(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      background: selectedClient?.id === c.id ? "var(--bg)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>{error}</p>}
      </Modal>

      <Modal
        open={segment === "location"}
        onClose={closeEditor}
        title="Set service location"
        footer={
          <>
            <Button variant="secondary" onClick={closeEditor} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={requestConfirm}>Review change</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
              Link location from
            </legend>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {([
                ["job", "Linked project (job)"],
                ["property", "Client property"],
                ["client_billing", "Client billing address"],
              ] as const).map(([mode, label]) => (
                <label key={mode} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="location-mode"
                    checked={locationMode === mode}
                    onChange={() => setLocationMode(mode)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {locationMode === "job" && (
            <Select
              id="doc-location-job"
              label="Project"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              placeholder="Select a project"
              options={jobs.map((j) => ({
                value: j.id,
                label: formatPropertyOption(j.property_address ?? null, null, null, null, j.title),
              }))}
            />
          )}

          {locationMode === "property" && !addProperty && (
            <>
              <Select
                id="doc-location-property"
                label="Property"
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                placeholder="Select a property"
                options={properties.map((p) => ({
                  value: p.id,
                  label: formatPropertyOption(p.address, p.city, p.state, p.zip),
                }))}
              />
              <Button variant="ghost" size="sm" onClick={() => setAddProperty(true)}>
                + Add new property
              </Button>
            </>
          )}

          {locationMode === "property" && addProperty && (
            <>
              <Input id="doc-new-address" label="Street address" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} required />
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "var(--space-2)" }}>
                <Input id="doc-new-city" label="City" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
                <Input id="doc-new-state" label="State" value={newState} onChange={(e) => setNewState(e.target.value)} />
                <Input id="doc-new-zip" label="ZIP" value={newZip} onChange={(e) => setNewZip(e.target.value)} />
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAddProperty(false)}>
                Pick existing property instead
              </Button>
            </>
          )}

          {locationMode === "client_billing" && (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-secondary)", margin: 0 }}>
              {clientBillingAddress
                ? `Uses billing address: ${clientBillingAddress}`
                : "No billing address on file for this client. Add one on the client record or pick a property instead."}
            </p>
          )}

          <div
            style={{
              padding: "var(--space-2) var(--space-3)",
              background: "var(--bg)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              fontSize: "var(--text-sm)",
            }}
          >
            <strong>Preview:</strong> {previewLocation()}
          </div>
        </div>
        {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>{error}</p>}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm change"
        body={confirmBody()}
        confirmLabel="Save"
        onConfirm={() => void applyChange()}
        onCancel={() => setConfirmOpen(false)}
        loading={pending}
        data-testid="document-links-confirm"
      />
    </>
  );
}