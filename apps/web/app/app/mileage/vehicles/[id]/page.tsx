"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageContainer, PageHeader, Card, LinkButton } from "@/components/ui";

type Vehicle = {
  id: string;
  nickname: string;
  make: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  kind?: string;
  current_odometer: number | null;
};

const SERVICE_TYPES = [
  "oil_change",
  "tire_rotation",
  "tires",
  "brakes",
  "inspection",
  "repair",
  "other",
];

export default function VehicleDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "fuel" | "service">("overview");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState("");

  // Fuel form
  const [odo, setOdo] = useState("");
  const [gallons, setGallons] = useState("");
  const [dollars, setDollars] = useState("");
  const [fullTank, setFullTank] = useState(true);

  // Service form
  const [svcTypes, setSvcTypes] = useState<string[]>(["oil_change"]);
  const [svcOdo, setSvcOdo] = useState("");
  const [svcDollars, setSvcDollars] = useState("");
  const [svcVendor, setSvcVendor] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/vehicles").catch(() => null);
    if (!res?.ok) {
      setError("Failed to load vehicle");
      return;
    }
    const data = await res.json();
    const list = (data.data ?? []) as Vehicle[];
    const v = list.find((x) => x.id === id) ?? null;
    setVehicle(v);
    if (v?.current_odometer != null) {
      setOdo(String(v.current_odometer));
      setSvcOdo(String(v.current_odometer));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isTrailer = vehicle?.kind === "trailer";

  async function logFuel(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    const amountCents = Math.round(parseFloat(dollars) * 100);
    const res = await fetch(`/api/v1/vehicles/${id}/fuel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        odometer: odo ? parseInt(odo, 10) : null,
        gallons: parseFloat(gallons),
        amount_cents: amountCents,
        is_full_tank: fullTank,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.message ?? "Failed to log fuel");
      return;
    }
    const body = await res.json();
    setToast(
      `Logged · ${vehicle?.nickname ?? "vehicle"} · $${(amountCents / 100).toFixed(2)}${
        body.data?.odometerSuspect ? " · odometer flagged" : ""
      }`,
    );
    setGallons("");
    setDollars("");
    load();
  }

  async function logService(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    const amountCents = Math.round(parseFloat(svcDollars) * 100);
    const res = await fetch(`/api/v1/vehicles/${id}/service`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviced_at: new Date().toISOString().slice(0, 10),
        odometer: svcOdo ? parseInt(svcOdo, 10) : null,
        service_types: svcTypes,
        amount_cents: amountCents,
        vendor_name: svcVendor || undefined,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.message ?? "Failed to log service");
      return;
    }
    setToast(`Service logged · ${vehicle?.nickname ?? "vehicle"} · $${(amountCents / 100).toFixed(2)}`);
    setSvcDollars("");
    load();
  }

  if (!vehicle && !error) {
    return (
      <PageContainer>
        <p>Loading…</p>
      </PageContainer>
    );
  }

  if (!vehicle) {
    return (
      <PageContainer>
        <p>{error || "Vehicle not found"}</p>
        <Link href="/app/mileage/vehicles">← Vehicles</Link>
      </PageContainer>
    );
  }

  const tabs = isTrailer
    ? (["overview", "service"] as const)
    : (["overview", "fuel", "service"] as const);

  return (
    <PageContainer>
      <PageHeader
        title={vehicle.nickname}
        subtitle={[vehicle.year, vehicle.make, vehicle.model, vehicle.plate]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <LinkButton href="/app/mileage/vehicles" variant="secondary" size="sm">
            ← Fleet
          </LinkButton>
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 4,
            background: "#ffedd5",
          }}
        >
          {(vehicle.kind ?? "truck").toUpperCase()}
        </span>
        {vehicle.current_odometer != null && (
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            Odo {vehicle.current_odometer.toLocaleString()} mi
          </span>
        )}
      </div>

      <nav style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              minHeight: 44,
              padding: "0 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: tab === t ? "var(--color-accent, #c2410c)" : "transparent",
              color: tab === t ? "#fff" : "inherit",
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      {toast && (
        <p role="status" style={{ color: "var(--color-success, #15803d)", marginBottom: 12 }}>
          {toast}
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: "#b91c1c", marginBottom: 12 }}>
          {error}
        </p>
      )}

      {tab === "overview" && (
        <Card>
          <p style={{ margin: 0 }}>
            Log fuel and service from the tabs. Each save creates an expense on this vehicle
            automatically (tax dual path with mileage).
          </p>
          <p style={{ marginTop: 12, color: "var(--fg-muted)", fontSize: 14 }}>
            Cost/mo, MPG, and next-due fill in as you log fills and services. Export vehicle
            expenses via month-end / expense reports with vehicle attribution.
          </p>
        </Card>
      )}

      {tab === "fuel" && !isTrailer && (
        <Card>
          <h2 style={{ marginTop: 0 }}>Log fuel</h2>
          <form onSubmit={logFuel} style={{ display: "grid", gap: 12, maxWidth: 360 }}>
            <label>
              Odometer
              <input
                inputMode="decimal"
                value={odo}
                onChange={(e) => setOdo(e.target.value)}
                style={{ display: "block", width: "100%", minHeight: 44, marginTop: 4 }}
              />
            </label>
            <label>
              Gallons
              <input
                required
                inputMode="decimal"
                value={gallons}
                onChange={(e) => setGallons(e.target.value)}
                style={{ display: "block", width: "100%", minHeight: 44, marginTop: 4 }}
              />
            </label>
            <label>
              Total $
              <input
                required
                inputMode="decimal"
                value={dollars}
                onChange={(e) => setDollars(e.target.value)}
                style={{ display: "block", width: "100%", minHeight: 44, marginTop: 4 }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
              <input
                type="checkbox"
                checked={fullTank}
                onChange={(e) => setFullTank(e.target.checked)}
              />
              Full tank
            </label>
            <button type="submit" disabled={pending} style={{ minHeight: 44, fontWeight: 600 }}>
              {pending ? "Saving…" : "Save fuel"}
            </button>
          </form>
        </Card>
      )}

      {tab === "service" && (
        <Card>
          <h2 style={{ marginTop: 0 }}>Log service</h2>
          <form onSubmit={logService} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
            <fieldset style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
              <legend>Service types</legend>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SERVICE_TYPES.map((t) => {
                  const on = svcTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setSvcTypes((prev) =>
                          on ? prev.filter((x) => x !== t) : [...prev, t],
                        )
                      }
                      style={{
                        minHeight: 40,
                        padding: "0 10px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: on ? "#ffedd5" : "transparent",
                        fontWeight: 600,
                      }}
                    >
                      {t.replace(/_/g, " ")}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label>
              Odometer
              <input
                inputMode="decimal"
                value={svcOdo}
                onChange={(e) => setSvcOdo(e.target.value)}
                style={{ display: "block", width: "100%", minHeight: 44, marginTop: 4 }}
              />
            </label>
            <label>
              Vendor
              <input
                value={svcVendor}
                onChange={(e) => setSvcVendor(e.target.value)}
                style={{ display: "block", width: "100%", minHeight: 44, marginTop: 4 }}
              />
            </label>
            <label>
              Total $
              <input
                required
                inputMode="decimal"
                value={svcDollars}
                onChange={(e) => setSvcDollars(e.target.value)}
                style={{ display: "block", width: "100%", minHeight: 44, marginTop: 4 }}
              />
            </label>
            <button
              type="submit"
              disabled={pending || svcTypes.length === 0}
              style={{ minHeight: 44, fontWeight: 600 }}
            >
              {pending ? "Saving…" : "Save service"}
            </button>
          </form>
        </Card>
      )}
    </PageContainer>
  );
}
