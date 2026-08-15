"use client";

import { useState } from "react";
import Image from "next/image";
import { Button, Card, EmptyState, Input, Modal } from "@/components/ui";
import {
  dollarsFromCents,
  formatFillDate,
  formatGallons,
} from "@/lib/vehicles/fuel-display";

export type FuelFill = {
  id: string;
  filled_at: string;
  odometer: number | null;
  gallons: number;
  is_full_tank: boolean;
  vendor_name: string | null;
  amount_cents: number | null;
  has_receipt: boolean;
  expense_id: string | null;
  dollars_per_gallon: number | null;
  mpg: number | null;
};

export function VehicleFuelPanel({
  fills,
  odo,
  gallons,
  dollarsIn,
  fullTank,
  pending,
  onOdo,
  onGallons,
  onDollars,
  onFullTank,
  onSubmit,
}: {
  fills: FuelFill[];
  odo: string;
  gallons: string;
  dollarsIn: string;
  fullTank: boolean;
  pending: boolean;
  onOdo: (v: string) => void;
  onGallons: (v: string) => void;
  onDollars: (v: string) => void;
  onFullTank: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const [open, setOpen] = useState<FuelFill | null>(null);

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      {fills.length === 0 ? (
        <EmptyState
          title="No fills on this truck yet"
          description="Log a full tank below. Gallons and dollars from the pump; odometer prefills from the last reading."
        />
      ) : (
        <Card padding="none">
          <ul
            style={{ listStyle: "none", margin: 0, padding: 0 }}
            data-testid="fuel-history"
          >
            {fills.map((fill, i) => {
              const clickable = !!(fill.has_receipt && fill.expense_id);
              const RowTag = clickable ? "button" : "div";
              return (
                <li
                  key={fill.id}
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <RowTag
                    type={clickable ? "button" : undefined}
                    onClick={clickable ? () => setOpen(fill) : undefined}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      padding: "var(--space-3) var(--space-4)",
                      cursor: clickable ? "pointer" : "default",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "var(--space-3)",
                        flexWrap: "wrap",
                        alignItems: "baseline",
                      }}
                    >
                      <strong style={{ fontSize: "var(--text-sm)" }}>
                        {formatFillDate(fill.filled_at)}
                        {fill.vendor_name ? ` · ${fill.vendor_name}` : ""}
                      </strong>
                      <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>
                        {fill.amount_cents != null
                          ? dollarsFromCents(fill.amount_cents)
                          : "—"}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: "var(--fg-muted)",
                        fontSize: "var(--text-sm)",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "var(--space-2)",
                      }}
                    >
                      <span>{formatGallons(fill.gallons)} gal</span>
                      {fill.dollars_per_gallon != null && (
                        <span>${fill.dollars_per_gallon.toFixed(3)}/gal</span>
                      )}
                      {fill.odometer != null && (
                        <span>{fill.odometer.toLocaleString()} mi</span>
                      )}
                      {fill.mpg != null && (
                        <span style={{ color: "var(--fg)", fontWeight: 600 }}>
                          {fill.mpg} mpg
                        </span>
                      )}
                      {fill.is_full_tank && <span>Full tank</span>}
                      {clickable && <span>Receipt</span>}
                    </div>
                  </RowTag>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <h2 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-base)" }}>
          Log a fill
        </h2>
        <form
          onSubmit={onSubmit}
          style={{ display: "grid", gap: "var(--space-3)", maxWidth: 400 }}
        >
          <Input
            id="fuel-odo"
            label="Odometer"
            inputMode="numeric"
            value={odo}
            onChange={(e) => onOdo(e.target.value)}
          />
          <Input
            id="fuel-gal"
            label="Gallons"
            required
            inputMode="decimal"
            value={gallons}
            onChange={(e) => onGallons(e.target.value)}
          />
          <Input
            id="fuel-dollars"
            label="Total $"
            required
            inputMode="decimal"
            value={dollarsIn}
            onChange={(e) => onDollars(e.target.value)}
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 44,
              fontSize: "var(--text-sm)",
            }}
          >
            <input
              type="checkbox"
              checked={fullTank}
              onChange={(e) => onFullTank(e.target.checked)}
            />
            Full tank
          </label>
          <Button type="submit" disabled={pending} style={{ justifySelf: "start" }}>
            {pending ? "Saving…" : "Save fill"}
          </Button>
        </form>
      </Card>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={
          open
            ? `${formatFillDate(open.filled_at)}${open.vendor_name ? ` · ${open.vendor_name}` : ""}`
            : "Receipt"
        }
      >
        {open?.expense_id ? (
          <Image
            src={`/api/v1/expenses/${open.expense_id}/receipt`}
            alt={`Fuel receipt ${formatFillDate(open.filled_at)}`}
            width={720}
            height={960}
            unoptimized
            style={{
              width: "100%",
              height: "auto",
              maxHeight: "70vh",
              objectFit: "contain",
              background: "var(--surface-raised, #f5f5f4)",
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
