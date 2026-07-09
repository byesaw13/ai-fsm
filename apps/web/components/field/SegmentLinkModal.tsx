"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ConfirmDialog, Input, Modal, Select } from "@/components/ui";
import { formatPropertyOption } from "@/lib/documents/location-source";

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

export interface SegmentLinkValues {
  clientId: string;
  clientName: string;
  propertyId: string | null;
  propertyAddress: string | null;
  jobId: string | null;
  jobTitle: string | null;
}

export interface SegmentLinkModalProps {
  open: boolean;
  onClose: () => void;
  segmentId: string;
  segmentKind: "stop" | "drive";
  placeLabel: string | null;
  startedAt: string;
  endedAt: string | null;
  initial: SegmentLinkValues | null;
  /** Stops persist via API; drives store locally until trip confirm. */
  persistMode: "api" | "local";
  onSaved: (values: SegmentLinkValues) => void | Promise<void>;
}

export function SegmentLinkModal({
  open,
  onClose,
  segmentId,
  segmentKind,
  placeLabel,
  startedAt,
  endedAt,
  initial,
  persistMode,
  onSaved,
}: SegmentLinkModalProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientResult[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");

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
    if (!open) return;
    setError(null);
    setConfirmOpen(false);
    if (initial) {
      setSelectedClient({ id: initial.clientId, name: initial.clientName });
      setClientQuery(initial.clientName);
      setSelectedJobId(initial.jobId ?? "");
      setSelectedPropertyId(initial.propertyId ?? "");
      void loadJobsAndProperties(initial.clientId);
    } else {
      setSelectedClient(null);
      setClientQuery("");
      setSelectedJobId("");
      setSelectedPropertyId("");
      setJobs([]);
      setProperties([]);
    }
  }, [open, initial, loadJobsAndProperties]);

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

  useEffect(() => {
    if (!selectedClient) return;
    void loadJobsAndProperties(selectedClient.id);
  }, [selectedClient?.id, loadJobsAndProperties]);

  useEffect(() => {
    if (!selectedJobId) return;
    const job = jobs.find((j) => j.id === selectedJobId);
    if (job?.property_id) {
      setSelectedPropertyId(job.property_id);
    }
  }, [selectedJobId, jobs]);

  function previewText(): string {
    if (!selectedClient) return "Select a customer";
    const parts = [selectedClient.name];
    const job = jobs.find((j) => j.id === selectedJobId);
    const prop = properties.find((p) => p.id === selectedPropertyId);
    if (job) parts.push(job.title);
    if (prop) {
      parts.push(formatPropertyOption(prop.address, prop.city, prop.state, prop.zip));
    } else if (job?.property_address) {
      parts.push(job.property_address);
    }
    return parts.join(" · ");
  }

  function buildValues(): SegmentLinkValues {
    if (!selectedClient) throw new Error("Select a customer");
    const job = jobs.find((j) => j.id === selectedJobId);
    const prop = properties.find((p) => p.id === selectedPropertyId);
    return {
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      propertyId: selectedPropertyId || job?.property_id || null,
      propertyAddress: prop
        ? formatPropertyOption(prop.address, prop.city, prop.state, prop.zip)
        : job?.property_address ?? null,
      jobId: selectedJobId || null,
      jobTitle: job?.title ?? null,
    };
  }

  function requestConfirm() {
    try {
      buildValues();
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
      const values = buildValues();
      if (persistMode === "api") {
        if (!endedAt) {
          setError("Wait until the stop ends before linking a customer");
          setConfirmOpen(false);
          return;
        }
        const res = await fetch(`/api/v1/activities/segments/${segmentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set_links",
            client_id: values.clientId,
            property_id: values.propertyId,
            job_id: values.jobId,
          }),
        });
        const data = (await res.json()) as { error?: { message?: string } };
        if (!res.ok) {
          setError(data.error?.message ?? "Failed to save");
          setConfirmOpen(false);
          return;
        }
      }
      await onSaved(values);
      setConfirmOpen(false);
      onClose();
    } catch {
      setError("Network error — please try again");
      setConfirmOpen(false);
    } finally {
      setPending(false);
    }
  }

  const kindLabel = segmentKind === "drive" ? "drive" : "stop";

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Link ${kindLabel}`}
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={requestConfirm} disabled={!selectedClient}>
              Save
            </Button>
          </>
        }
        data-testid="segment-link-modal"
      >
        <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", margin: "0 0 var(--space-3)" }}>
          {placeLabel ?? (segmentKind === "drive" ? "Driving" : "Stop")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ position: "relative" }}>
            <Input
              id="segment-client-search"
              label="Customer"
              value={clientQuery}
              onChange={(e) => {
                setClientQuery(e.target.value);
                setSelectedClient(null);
                setSelectedJobId("");
                setSelectedPropertyId("");
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

          <Select
            id="segment-link-job"
            label="Project (optional)"
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            placeholder={selectedClient ? "Select a project" : "Pick a customer first"}
            disabled={!selectedClient}
            options={[
              { value: "", label: "No project" },
              ...jobs.map((j) => ({
                value: j.id,
                label: formatPropertyOption(j.property_address ?? null, null, null, null, j.title),
              })),
            ]}
          />

          <Select
            id="segment-link-property"
            label="Property (optional)"
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            placeholder={selectedClient ? "Select a property" : "Pick a customer first"}
            disabled={!selectedClient}
            options={[
              { value: "", label: "No property" },
              ...properties.map((p) => ({
                value: p.id,
                label: formatPropertyOption(p.address, p.city, p.state, p.zip),
              })),
            ]}
          />

          <div
            style={{
              padding: "var(--space-2) var(--space-3)",
              background: "var(--bg)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              fontSize: "var(--text-sm)",
            }}
          >
            <strong>Preview:</strong> {previewText()}
          </div>
        </div>

        {error && (
          <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
            {error}
          </p>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm link"
        body={`Link this ${kindLabel} to "${previewText()}"?`}
        confirmLabel="Confirm"
        onConfirm={() => void applyChange()}
        onCancel={() => setConfirmOpen(false)}
        loading={pending}
        data-testid="segment-link-confirm"
      />
    </>
  );
}