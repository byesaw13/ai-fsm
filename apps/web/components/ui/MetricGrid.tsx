import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

// ---------------------------------------------------------------------------
// MetricGrid — 3-4 column KPI card grid, responsive
// ---------------------------------------------------------------------------

export interface MetricCardData {
  label: string;
  value: number | string;
  sub?: string;
  href?: string;
  variant?: "default" | "alert" | "success";
  icon?: ReactNode;
}

interface MetricGridProps {
  metrics: MetricCardData[];
  className?: string;
}

export function MetricGrid({ metrics, className = "" }: MetricGridProps) {
  return (
    <div className={`p7-metric-grid ${className}`}>
      {metrics.map((m) => (
        <MetricCard key={m.label} metric={m} />
      ))}
    </div>
  );
}

function MetricCard({ metric }: { metric: MetricCardData }) {
  const variantClass =
    metric.variant === "alert"
      ? "p7-metric-alert"
      : metric.variant === "success"
      ? "p7-metric-success"
      : "";

  const inner = (
    <div className={`p7-metric-card ${variantClass}`}>
      {metric.icon && (
        <div style={{ marginBottom: "var(--space-2)" }}>{metric.icon}</div>
      )}
      <div className="p7-metric-label">{metric.label}</div>
      <div className="p7-metric-value">{metric.value}</div>
      {metric.sub && <div className="p7-metric-sub">{metric.sub}</div>}
    </div>
  );

  if (metric.href) {
    return (
      <Link href={metric.href as Route} style={{ textDecoration: "none", color: "inherit" }}>
        {inner}
      </Link>
    );
  }

  return inner;
}
