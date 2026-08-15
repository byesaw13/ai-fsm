"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useParams } from "next/navigation";
import {
  Button,
  Card,
  Input,
  LinkButton,
  MetricGrid,
  PageContainer,
  PageHeader,
} from "@/components/ui";
import { dollarsFromCents, formatFillDate, vehicleCostLabel } from "@/lib/vehicles/fuel-display";
import { VehicleFuelPanel, type FuelFill } from "./VehicleFuelPanel";

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
  recent_fuel: FuelFill[];
  last_fill: FuelFill | null;
  mpg: { last: number | null; last_five: number | null };
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

export default function VehicleDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "fuel" | "service">("fuel");
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

  useEffect(() => {
    if (isTrailer) setTab("overview");
  }, [isTrailer]);

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
  const lastFill = overview?.last_fill ?? overview?.recent_fuel?.[0] ?? null;

  return (
    <PageContainer>
      <PageHeader
        title={vehicle.nickname}
        subtitle={[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
        actions={
          <span style={{ display: "inline-flex", gap: "var(--space-2)", alignItems: "center" }}>
            {vehicle.plate && (
              <span
                style={{
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                  fontSize: "var(--text-xs)",
                  letterSpacing: "0.08em",
                  padding: "4px 8px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {vehicle.plate}
              </span>
            )}
            <LinkButton href={"/app/mileage/vehicles" as Route} variant="secondary" size="sm">
              Fleet
            </LinkButton>
          </span>
        }
      />

      <div style={{ marginBottom: "var(--space-4)" }}>
        <MetricGrid
          metrics={[
            {
              label: "Odometer",
              value:
                vehicle.current_odometer != null
                  ? vehicle.current_odometer.toLocaleString()
                  : "—",
              sub: "mi",
            },
            {
              label: "Last fill",
              value: lastFill
                ? `${Number(lastFill.gallons).toLocaleString(undefined, { maximumFractionDigits: 1 })} gal`
                : "—",
              sub: lastFill
                ? `${formatFillDate(lastFill.filled_at)}${
                    lastFill.amount_cents != null
                      ? ` · ${dollarsFromCents(lastFill.amount_cents)}`
                      : ""
                  }`
                : "No fills yet",
            },
            {
              label: "MPG",
              value: overview?.mpg.last != null ? String(overview.mpg.last) : "—",
              sub:
                overview?.mpg.last_five != null
                  ? `Last 5 fills ${overview.mpg.last_five}`
                  : "Needs two full tanks",
            },
            {
              label: "90-day cost",
              value: dollarsFromCents(overview?.cost_last_90_days.total_cents ?? 0),
              sub: "Fuel, service, papers",
            },
          ]}
        />
      </div>

      <nav
        style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}
        aria-label="Vehicle sections"
      >
        {tabs.map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={tab === t ? "primary" : "ghost"}
            onClick={() => setTab(t)}
            style={{ textTransform: "capitalize" }}
          >
            {t === "fuel" ? "Fuel" : t === "service" ? "Service" : "Overview"}
          </Button>
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
                  {dollarsFromCents(overview.cost_last_90_days.total_cents)}
                </p>
                {overview.cost_last_90_days.by_category.length > 0 && (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14 }}>
                    {overview.cost_last_90_days.by_category.map((c) => (
                      <li key={c.category}>
                        {vehicleCostLabel(c.category)}: {dollarsFromCents(c.total_cents)}
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
                {overview.loan.lender} · {dollarsFromCents(overview.loan.monthly_payment_cents)}/mo
                {overview.loan.current_balance_cents != null &&
                  ` · balance ${dollarsFromCents(overview.loan.current_balance_cents)}`}
              </p>
            </Card>
          )}

          {!isTrailer && overview?.recent_fuel && overview.recent_fuel.length > 0 && (
            <Card>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Recent fuel</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                {overview.recent_fuel.slice(0, 3).map((f) => (
                  <li key={f.id}>
                    {formatFillDate(f.filled_at)} · {Number(f.gallons).toFixed(1)} gal
                    {f.amount_cents != null ? ` · ${dollarsFromCents(f.amount_cents)}` : ""}
                    {f.mpg != null ? ` · ${f.mpg} mpg` : ""}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTab("fuel")}
                style={{ marginTop: 8 }}
              >
                All fills →
              </Button>
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
        <VehicleFuelPanel
          fills={overview?.recent_fuel ?? []}
          odo={odo}
          gallons={gallons}
          dollarsIn={dollarsIn}
          fullTank={fullTank}
          pending={pending}
          onOdo={setOdo}
          onGallons={setGallons}
          onDollars={setDollarsIn}
          onFullTank={setFullTank}
          onSubmit={logFuel}
        />
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
            <Input
              id="svc-odo"
              label="Odometer"
              inputMode="numeric"
              value={svcOdo}
              onChange={(e) => setSvcOdo(e.target.value)}
            />
            <Input
              id="svc-vendor"
              label="Vendor"
              value={svcVendor}
              onChange={(e) => setSvcVendor(e.target.value)}
            />
            <Input
              id="svc-dollars"
              label="Total $"
              required
              inputMode="decimal"
              value={svcDollars}
              onChange={(e) => setSvcDollars(e.target.value)}
            />
            <Button type="submit" disabled={pending || svcTypes.length === 0}>
              {pending ? "Saving…" : "Save service"}
            </Button>
          </form>
        </Card>
      )}
    </PageContainer>
  );
}
