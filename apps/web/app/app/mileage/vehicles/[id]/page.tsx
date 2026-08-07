"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
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

type OverviewData = {
  vehicle: Vehicle & { vin?: string | null };
  next_service_dues: Array<{
    serviceType: string;
    status: string;
    milesRemaining: number | null;
    daysRemaining: number | null;
    dueOdometer: number | null;
    dueDate: string | null;
  }>;
  next_renewals: Array<{
    id: string;
    renewal_type: string;
    provider: string | null;
    current_due_date: string;
    days_remaining: number;
    status: string;
  }>;
  cost_last_90_days: {
    total_cents: number;
    by_category: Array<{ category: string; total_cents: number; expense_count: number }>;
  };
  loan: {
    lender: string;
    monthly_payment_cents: number;
    current_balance_cents: number | null;
  } | null;
  recent_fuel: Array<{ id: string; filled_at: string; gallons: number; odometer: number | null }>;
  recent_service: Array<{
    id: string;
    serviced_at: string;
    service_types: string[];
    vendor_name: string | null;
  }>;
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

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function VehicleDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "fuel" | "service">("overview");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState("");

  const [odo, setOdo] = useState("");
  const [gallons, setGallons] = useState("");
  const [dollarsIn, setDollarsIn] = useState("");
  const [fullTank, setFullTank] = useState(true);

  const [svcTypes, setSvcTypes] = useState<string[]>(["oil_change"]);
  const [svcOdo, setSvcOdo] = useState("");
  const [svcDollars, setSvcDollars] = useState("");
  const [svcVendor, setSvcVendor] = useState("");

  const load = useCallback(async () => {
    const [listRes, ovRes] = await Promise.all([
      fetch("/api/v1/vehicles").catch(() => null),
      fetch(`/api/v1/vehicles/${id}/overview`).catch(() => null),
    ]);

    if (listRes?.ok) {
      const data = await listRes.json();
      const list = (data.data ?? []) as Vehicle[];
      const v = list.find((x) => x.id === id) ?? null;
      setVehicle(v);
      if (v?.current_odometer != null) {
        setOdo(String(v.current_odometer));
        setSvcOdo(String(v.current_odometer));
      }
    } else if (!ovRes?.ok) {
      setError("Failed to load vehicle");
      return;
    }

    if (ovRes?.ok) {
      const body = await ovRes.json();
      const ov = body.data as OverviewData;
      setOverview(ov);
      if (ov?.vehicle) {
        setVehicle((prev) => prev ?? ov.vehicle);
        if (ov.vehicle.current_odometer != null) {
          setOdo(String(ov.vehicle.current_odometer));
          setSvcOdo(String(ov.vehicle.current_odometer));
        }
      }
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
    const amountCents = Math.round(parseFloat(dollarsIn) * 100);
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
    setDollarsIn("");
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
    setToast(
      `Service logged · ${vehicle?.nickname ?? "vehicle"} · $${(amountCents / 100).toFixed(2)}`,
    );
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
        <Link href={"/app/mileage/vehicles" as Route}>← Vehicles</Link>
      </PageContainer>
    );
  }

  const tabs = isTrailer
    ? (["overview", "service"] as const)
    : (["overview", "fuel", "service"] as const);

  const dues = overview?.next_service_dues?.filter((d) => d.status !== "ok") ?? [];
  const renewals = overview?.next_renewals ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={vehicle.nickname}
        subtitle={[vehicle.year, vehicle.make, vehicle.model, vehicle.plate]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <LinkButton href={"/app/mileage/vehicles" as Route} variant="secondary" size="sm">
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
        {overview?.cost_last_90_days && overview.cost_last_90_days.total_cents > 0 && (
          <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            90d cost {dollars(overview.cost_last_90_days.total_cents)}
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
        <div style={{ display: "grid", gap: 12 }}>
          <Card>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Cost (last 90 days)</h2>
            {overview?.cost_last_90_days ? (
              <>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                  {dollars(overview.cost_last_90_days.total_cents)}
                </p>
                {overview.cost_last_90_days.by_category.length > 0 && (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14 }}>
                    {overview.cost_last_90_days.by_category.map((c) => (
                      <li key={c.category}>
                        {c.category.replace(/_/g, " ")}: {dollars(c.total_cents)}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 14 }}>
                Log fuel and service to build cost history. Each save creates an expense on this
                vehicle.
              </p>
            )}
          </Card>

          <Card>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Next due</h2>
            {dues.length === 0 && renewals.length === 0 ? (
              <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 14 }}>
                No upcoming service or renewals. Owner can set schedules and renewal dates.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                {dues.map((d) => (
                  <li key={d.serviceType}>
                    <strong>{d.serviceType.replace(/_/g, " ")}</strong> — {d.status}
                    {d.milesRemaining != null && ` · ${d.milesRemaining} mi`}
                    {d.dueDate && ` · ${d.dueDate}`}
                  </li>
                ))}
                {renewals.map((r) => (
                  <li key={r.id}>
                    <strong>{r.renewal_type}</strong> — {r.status} · due {r.current_due_date}
                    {r.provider ? ` · ${r.provider}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {overview?.loan && (
            <Card>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Loan</h2>
              <p style={{ margin: 0, fontSize: 14 }}>
                {overview.loan.lender} · {dollars(overview.loan.monthly_payment_cents)}/mo
                {overview.loan.current_balance_cents != null &&
                  ` · balance ${dollars(overview.loan.current_balance_cents)}`}
              </p>
            </Card>
          )}

          {!isTrailer && overview?.recent_fuel && overview.recent_fuel.length > 0 && (
            <Card>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Recent fuel</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                {overview.recent_fuel.map((f) => (
                  <li key={f.id}>
                    {f.filled_at.slice(0, 10)} · {Number(f.gallons)} gal
                    {f.odometer != null ? ` · ${f.odometer.toLocaleString()} mi` : ""}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {overview?.recent_service && overview.recent_service.length > 0 && (
            <Card>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Recent service</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                {overview.recent_service.map((s) => (
                  <li key={s.id}>
                    {s.serviced_at.slice(0, 10)} · {(s.service_types ?? []).join(", ")}
                    {s.vendor_name ? ` · ${s.vendor_name}` : ""}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
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
                value={dollarsIn}
                onChange={(e) => setDollarsIn(e.target.value)}
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
