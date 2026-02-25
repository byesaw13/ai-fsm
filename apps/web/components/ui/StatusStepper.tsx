"use client";

// ---------------------------------------------------------------------------
// StatusStepper — horizontal pipeline progress indicator
//
// Shows the full lifecycle of an entity (job, estimate, invoice) as a
// connected stepper. Past steps show a checkmark, current step is highlighted,
// future steps are dimmed.
// ---------------------------------------------------------------------------

interface Step {
  key: string;
  label: string;
}

interface StatusStepperProps {
  steps: Step[];
  currentStep: string;
  "data-testid"?: string;
}

export function StatusStepper({ steps, currentStep, "data-testid": testId }: StatusStepperProps) {
  const currentIdx = steps.findIndex((s) => s.key === currentStep);

  return (
    <div
      style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", padding: "var(--space-2) 0" }}
      data-testid={testId ?? "status-stepper"}
    >
      {steps.map((step, idx) => {
        const isPast = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isLast = idx === steps.length - 1;

        return (
          <div
            key={step.key}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: isLast ? "0 0 auto" : "1 1 0",
              minWidth: 56,
            }}
          >
            {/* Circle + connector row */}
            <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: `2px solid ${isCurrent || isPast ? "var(--accent)" : "var(--border)"}`,
                  background: isCurrent ? "var(--accent)" : isPast ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--bg-card)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: "bold",
                  color: isCurrent ? "#fff" : isPast ? "var(--accent)" : "var(--fg-muted)",
                  transition: "all 0.2s",
                }}
              >
                {isPast ? "✓" : idx + 1}
              </div>
              {!isLast && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background: isPast ? "var(--accent)" : "var(--border)",
                    transition: "background 0.2s",
                  }}
                />
              )}
            </div>
            {/* Label */}
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: isCurrent ? "var(--accent)" : "var(--fg-muted)",
                fontWeight: isCurrent ? "var(--font-semibold)" : "normal",
                marginTop: "var(--space-1)",
                textAlign: "center",
                lineHeight: 1.2,
                maxWidth: 64,
                wordBreak: "break-word",
              }}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
