"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";

// ── Types ──────────────────────────────────────────────────────────────────

interface Service {
  id: string;
  code: string;
  name: string;
  category: string;
  price_min_cents: number;
  price_max_cents: number | null;
  default_price_cents: number | null;
  description: string | null;
}

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface Props {
  clients: Client[];
  featuredServices: Service[];
  initialClientId?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  general_repairs:     "Repairs",
  plumbing:            "Plumbing",
  electrical:          "Electrical",
  carpentry_furniture: "Carpentry",
  painting_finishes:   "Painting",
  outdoor_seasonal:    "Outdoor",
  mounting_installs:   "Mounting",
  maintenance_small:   "Small Jobs",
  specialty_expansion: "Specialty",
};

const CATEGORY_EMOJI: Record<string, string> = {
  general_repairs:     "🔧",
  plumbing:            "🚰",
  electrical:          "⚡",
  carpentry_furniture: "🪵",
  painting_finishes:   "🎨",
  outdoor_seasonal:    "🌿",
  mounting_installs:   "📺",
  maintenance_small:   "🛠️",
  specialty_expansion: "⭐",
};

function fmt(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function parseDollars(s: string): number {
  return Math.round(parseFloat(s.replace(/[^0-9.]/g, "") || "0") * 100);
}

// ── Main Wizard ────────────────────────────────────────────────────────────

export function QuickEstimateWizard({ clients, featuredServices, initialClientId }: Props) {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedClientId, setSelectedClientId] = useState(initialClientId ?? "");
  const [priceInput, setPriceInput] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sendImmediately, setSendImmediately] = useState(false);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  const filteredServices = useMemo(() => {
    if (!categoryFilter) return featuredServices;
    return featuredServices.filter((s) => s.category === categoryFilter);
  }, [featuredServices, categoryFilter]);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 12);
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 12);
  }, [clients, clientSearch]);

  const categories = useMemo(() => {
    const cats = new Set(featuredServices.map((s) => s.category));
    return Array.from(cats);
  }, [featuredServices]);

  function pickService(svc: Service) {
    setSelectedService(svc);
    const price = svc.default_price_cents ?? svc.price_min_cents;
    setPriceInput((price / 100).toFixed(2));
    setStep(2);
  }

  function pickClient(clientId: string) {
    setSelectedClientId(clientId);
    setStep(3);
  }

  async function handleSubmit() {
    if (!selectedService || !selectedClientId) return;
    const flat_rate_cents = parseDollars(priceInput);
    if (flat_rate_cents <= 0) {
      setError("Please enter a price greater than $0.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: selectedClientId,
          flat_rate_cents,
          notes: [selectedService.name, notes.trim()].filter(Boolean).join("\n\n") || null,
          presentation_mode: "standard",
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error?.message ?? "Failed to create estimate");
        return;
      }
      const { id } = await res.json() as { id: string };

      if (sendImmediately) {
        await fetch(`/api/v1/estimates/${id}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "sent" }),
        });
      }

      router.push(`/app/estimates/${id}`);
    } catch {
      setError("Unexpected error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 1: Pick a service ─────────────────────────────────────────────

  if (step === 1) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div>
          <h2 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-lg)", fontWeight: 700 }}>
            What&apos;s the job?
          </h2>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            Select a service to pre-fill the price.
          </p>
        </div>

        {/* Category filter chips */}
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            style={{
              padding: "4px 12px", borderRadius: 99, fontSize: "var(--text-xs)", fontWeight: 600,
              background: !categoryFilter ? "var(--accent)" : "var(--bg)",
              color: !categoryFilter ? "#fff" : "var(--fg-muted)",
              border: "1px solid var(--border)", cursor: "pointer",
            }}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
              style={{
                padding: "4px 12px", borderRadius: 99, fontSize: "var(--text-xs)", fontWeight: 600,
                background: categoryFilter === cat ? "var(--accent)" : "var(--bg)",
                color: categoryFilter === cat ? "#fff" : "var(--fg-muted)",
                border: "1px solid var(--border)", cursor: "pointer",
              }}
            >
              {CATEGORY_EMOJI[cat]} {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>

        {/* Service cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {filteredServices.map((svc) => {
            const price = svc.default_price_cents ?? svc.price_min_cents;
            const priceLabel = svc.price_max_cents
              ? `${fmt(svc.price_min_cents)}–${fmt(svc.price_max_cents)}`
              : `${fmt(svc.price_min_cents)}+`;
            return (
              <button
                key={svc.id}
                type="button"
                onClick={() => pickService(svc)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "var(--space-4)", borderRadius: "var(--radius-md)",
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                  cursor: "pointer", textAlign: "left", gap: "var(--space-3)",
                  transition: "border-color 0.1s, box-shadow 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                <span>
                  <span style={{ display: "block", fontWeight: 600, fontSize: "var(--text-sm)" }}>
                    {svc.name}
                  </span>
                  {svc.description && (
                    <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                      {svc.description.length > 80 ? svc.description.slice(0, 80) + "…" : svc.description}
                    </span>
                  )}
                </span>
                <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--accent)", whiteSpace: "nowrap" }}>
                  {fmt(price)}
                </span>
              </button>
            );
          })}

          {/* Custom / other option */}
          <button
            type="button"
            onClick={() => {
              setSelectedService({
                id: "custom",
                code: "custom",
                name: "Custom job",
                category: "general_repairs",
                price_min_cents: 0,
                price_max_cents: null,
                default_price_cents: null,
                description: null,
              });
              setPriceInput("0.00");
              setStep(2);
            }}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "var(--space-4)", borderRadius: "var(--radius-md)",
              background: "var(--bg)", border: "1px dashed var(--border)",
              cursor: "pointer", textAlign: "left",
            }}
          >
            <span style={{ fontWeight: 500, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              ✏️ Custom job / other
            </span>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Enter price manually →</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Pick a client ──────────────────────────────────────────────

  if (step === 2) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <button
            type="button"
            onClick={() => setStep(1)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: "var(--text-lg)", padding: 0 }}
          >
            ←
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700 }}>Who&apos;s the client?</h2>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              {selectedService?.name}
            </p>
          </div>
        </div>

        <input
          type="search"
          placeholder="Search clients…"
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
          autoFocus
          style={{
            width: "100%", padding: "var(--space-3)", borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)", fontSize: "var(--text-base)",
            background: "var(--bg-card)", boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {filteredClients.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pickClient(c.id)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)",
                background: "var(--bg-card)", border: "1px solid var(--border)",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <span>
                <span style={{ display: "block", fontWeight: 600, fontSize: "var(--text-sm)" }}>{c.name}</span>
                {c.phone && (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{c.phone}</span>
                )}
              </span>
              <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>→</span>
            </button>
          ))}
          {filteredClients.length === 0 && (
            <p style={{ textAlign: "center", color: "var(--fg-muted)", fontSize: "var(--text-sm)", padding: "var(--space-6) 0" }}>
              No clients found.{" "}
              <Link href={"/app/clients/new" as Route} style={{ color: "var(--accent)" }}>Add a new client →</Link>
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Step 3: Review & confirm ───────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <button
          type="button"
          onClick={() => setStep(2)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: "var(--text-lg)", padding: 0 }}
        >
          ←
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700 }}>Review estimate</h2>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            {selectedService?.name} · {selectedClient?.name}
          </p>
        </div>
      </div>

      {/* Summary card */}
      <div style={{ padding: "var(--space-4)", borderRadius: "var(--radius-md)", background: "var(--bg)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
          <span style={{ fontWeight: 700 }}>{selectedService?.name}</span>
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          Client: <strong style={{ color: "var(--fg)" }}>{selectedClient?.name}</strong>
        </div>
      </div>

      {/* Price field */}
      <div>
        <label style={{ display: "block", fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
          Price
        </label>
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
            fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--fg-muted)",
          }}>$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            style={{
              width: "100%", padding: "var(--space-3) var(--space-3) var(--space-3) 28px",
              borderRadius: "var(--radius-md)", border: "2px solid var(--accent)",
              fontSize: "var(--text-2xl)", fontWeight: 700,
              background: "var(--bg-card)", boxSizing: "border-box",
            }}
          />
        </div>
        {selectedService && selectedService.price_min_cents > 0 && (
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            Typical range: {fmt(selectedService.price_min_cents)}
            {selectedService.price_max_cents ? `–${fmt(selectedService.price_max_cents)}` : "+"}
          </p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label style={{ display: "block", fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
          Notes <span style={{ fontWeight: 400, color: "var(--fg-muted)" }}>(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any specifics about the job…"
          rows={3}
          style={{
            width: "100%", padding: "var(--space-3)", borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)", fontSize: "var(--text-sm)",
            background: "var(--bg-card)", boxSizing: "border-box", resize: "vertical",
          }}
        />
      </div>

      {error && (
        <p style={{ color: "#dc2626", fontSize: "var(--text-sm)", margin: 0 }}>{error}</p>
      )}

      {/* Submit options */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={() => { setSendImmediately(false); handleSubmit(); }}
          disabled={submitting}
          style={{
            padding: "var(--space-4)", borderRadius: "var(--radius-md)", border: "none",
            background: "var(--accent)", color: "#fff", fontWeight: 700,
            fontSize: "var(--text-base)", cursor: submitting ? "wait" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Creating…" : "Save as Draft"}
        </button>
        <button
          type="button"
          onClick={() => { setSendImmediately(true); handleSubmit(); }}
          disabled={submitting}
          style={{
            padding: "var(--space-4)", borderRadius: "var(--radius-md)",
            border: "1px solid var(--accent)", background: "var(--bg-card)",
            color: "var(--accent)", fontWeight: 700, fontSize: "var(--text-base)",
            cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Sending…" : "Send to Client →"}
        </button>
      </div>
    </div>
  );
}
