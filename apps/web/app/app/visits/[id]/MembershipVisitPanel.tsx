"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
  VAULT_CATEGORY_LABELS,
  type MembershipVisitPhase,
  type MembershipCapStatus,
  type VaultCategory,
  type VaultCollectionStep,
} from "@ai-fsm/domain";
import {
  MEMBERSHIP_PHASE_LABELS,
  MEMBERSHIP_PHASE_DESCRIPTIONS,
  nextMembershipPhase,
} from "@/lib/visits/membership-cap";

interface Props {
  visitId: string;
  phase: MembershipVisitPhase;
  capMinutes: number | null;
  minutesUsed: number;
  capStatus: MembershipCapStatus;
  canUpdate: boolean;
  visitStatus: string;
  propertyId: string | null;
  vaultCollection: VaultCollectionStep | null;
}

const PHASES: MembershipVisitPhase[] = ["health_check", "included_action", "reporting"];

function formatCategoryList(categories: VaultCategory[]) {
  return categories.map((category) => VAULT_CATEGORY_LABELS[category]).join(", ");
}

export function MembershipVisitPanel({
  visitId,
  phase,
  capMinutes,
  minutesUsed,
  capStatus,
  canUpdate,
  visitStatus,
  propertyId,
  vaultCollection,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [advancing, setAdvancing] = useState(false);
  const [localMinutes, setLocalMinutes] = useState(minutesUsed);
  const [savingMinutes, setSavingMinutes] = useState(false);

  const next = nextMembershipPhase(phase);
  const isCompleted = visitStatus === "completed" || visitStatus === "cancelled";

  async function advancePhase() {
    if (!next || advancing) return;
    setAdvancing(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_visit_phase: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error?.message ?? "Failed to advance phase");
        return;
      }
      router.refresh();
    } catch {
      toast.error("Unexpected error advancing phase");
    } finally {
      setAdvancing(false);
    }
  }

  async function saveMinutes() {
    setSavingMinutes(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ included_labor_minutes_used: localMinutes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error?.message ?? "Failed to save labor minutes");
        return;
      }
      router.refresh();
    } catch {
      toast.error("Unexpected error saving labor minutes");
    } finally {
      setSavingMinutes(false);
    }
  }

  const capPct =
    capMinutes && capMinutes > 0
      ? Math.min(100, Math.round((localMinutes / capMinutes) * 100))
      : 0;

  return (
    <div data-testid="membership-visit-panel">
      {/* Phase stepper */}
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          marginBottom: "var(--space-5)",
          alignItems: "center",
        }}
      >
        {PHASES.map((p, i) => {
          const idx = PHASES.indexOf(phase);
          const isDone = i < idx;
          const isCurrent = p === phase;
          return (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1 }}>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    marginBottom: "var(--space-1)",
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "var(--font-size-xs)",
                      fontWeight: 700,
                      flexShrink: 0,
                      background: isDone
                        ? "var(--color-success)"
                        : isCurrent
                        ? "var(--color-primary)"
                        : "var(--color-border)",
                      color: isDone || isCurrent ? "#fff" : "var(--color-text-secondary)",
                    }}
                  >
                    {isDone ? "✓" : i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--font-size-sm)",
                      fontWeight: isCurrent ? 600 : 400,
                      color: isCurrent
                        ? "var(--color-text-primary)"
                        : isDone
                        ? "var(--color-success)"
                        : "var(--color-text-secondary)",
                    }}
                  >
                    {MEMBERSHIP_PHASE_LABELS[p]}
                  </span>
                </div>
                {isCurrent && (
                  <p
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--color-text-secondary)",
                      marginLeft: 32,
                    }}
                  >
                    {MEMBERSHIP_PHASE_DESCRIPTIONS[p]}
                  </p>
                )}
              </div>
              {i < PHASES.length - 1 && (
                <div
                  style={{
                    width: 24,
                    height: 2,
                    background: isDone ? "var(--color-success)" : "var(--color-border)",
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {propertyId && vaultCollection && (
        <div
          data-testid="vault-collection-plan"
          style={{
            marginBottom: "var(--space-5)",
            padding: "var(--space-4)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
            <div>
              <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Vault Collection Focus
              </div>
              <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}>
                Visit {vaultCollection.visitNumber}
              </div>
            </div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
              {vaultCollection.cycleYear > 1
                ? `Year ${vaultCollection.cycleYear} · Visit ${vaultCollection.cycleVisitNumber} of ${vaultCollection.annualVisitCount}`
                : `Visit ${vaultCollection.cycleVisitNumber} of ${vaultCollection.annualVisitCount} this year`}
            </div>
          </div>

          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: "var(--space-3)" }}>
            Use this visit to collect or verify: {formatCategoryList(vaultCollection.focusCategories)}.
          </p>

          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
            {vaultCollection.focusCategories.map((category) => {
              const completed = vaultCollection.completedFocusCategories.includes(category);
              return (
                <span
                  key={category}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "999px",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: 600,
                    background: completed ? "var(--color-success-bg, #dcfce7)" : "var(--color-accent-soft, #eef2ff)",
                    color: completed ? "var(--color-success)" : "var(--color-primary)",
                  }}
                >
                  {VAULT_CATEGORY_LABELS[category]}
                  {completed ? " ✓" : ""}
                </span>
              );
            })}
          </div>

          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 0 }}>
            {vaultCollection.missingFocusCategories.length === 0
              ? "This visit's focus is already in the vault. Verify service dates, serials, notes, and condition while you're on site."
              : `Still to capture this visit: ${formatCategoryList(vaultCollection.missingFocusCategories)}.`}
          </p>

          {vaultCollection.missingCoreCategories.length > vaultCollection.missingFocusCategories.length && (
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: "var(--space-2)", marginBottom: 0 }}>
              Remaining overall: {formatCategoryList(vaultCollection.missingCoreCategories)}.
            </p>
          )}
        </div>
      )}

      {/* Labor cap tracker — shown in included_action phase */}
      {phase === "included_action" && capMinutes !== null && (
        <div
          data-testid="labor-cap-tracker"
          style={{
            marginBottom: "var(--space-5)",
            padding: "var(--space-4)",
            borderRadius: "var(--radius-md)",
            background:
              capStatus === "cap_reached"
                ? "var(--color-warning-bg, #fff8e1)"
                : "var(--color-surface)",
            border: `1px solid ${
              capStatus === "cap_reached"
                ? "var(--color-warning, #f59e0b)"
                : "var(--color-border)"
            }`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "var(--space-2)",
            }}
          >
            <span className="p7-label">Included Labor</span>
            <span
              className="p7-label"
              data-testid="labor-cap-label"
              style={{
                color:
                  capStatus === "cap_reached"
                    ? "var(--color-warning, #f59e0b)"
                    : "var(--color-text-secondary)",
                fontWeight: capStatus === "cap_reached" ? 700 : 400,
              }}
            >
              {localMinutes} / {capMinutes} min{capStatus === "cap_reached" ? " — Cap reached" : ""}
            </span>
          </div>

          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: "var(--color-border)",
              overflow: "hidden",
              marginBottom: "var(--space-3)",
            }}
          >
            <div
              data-testid="labor-cap-bar"
              style={{
                height: "100%",
                width: `${capPct}%`,
                background:
                  capStatus === "cap_reached"
                    ? "var(--color-warning, #f59e0b)"
                    : "var(--color-primary)",
                transition: "width 0.2s ease",
              }}
            />
          </div>

          {capStatus === "cap_reached" && (
            <p
              data-testid="cap-reached-banner"
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-warning, #b45309)",
                marginBottom: "var(--space-3)",
                fontWeight: 500,
              }}
            >
              Labor cap reached. Convert remaining items to quoted follow-up, monitor, referral, or optional improvement before completing the visit.
            </p>
          )}

          {canUpdate && !isCompleted && (
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label
                  htmlFor="minutes-used-input"
                  className="p7-label"
                  style={{ display: "block", marginBottom: "var(--space-1)" }}
                >
                  Minutes used
                </label>
                <input
                  id="minutes-used-input"
                  type="number"
                  className="p7-input"
                  min={0}
                  max={999}
                  value={localMinutes}
                  onChange={(e) => setLocalMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  disabled={savingMinutes}
                  data-testid="minutes-used-input"
                />
              </div>
              <button
                className="p7-btn p7-btn-secondary"
                onClick={saveMinutes}
                disabled={savingMinutes || localMinutes === minutesUsed}
                data-testid="save-minutes-btn"
              >
                {savingMinutes ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Phase advance button */}
      {canUpdate && !isCompleted && next && (
        <button
          className="p7-btn p7-btn-primary"
          onClick={advancePhase}
          disabled={advancing}
          data-testid="advance-phase-btn"
        >
          {advancing
            ? "Advancing…"
            : `Complete ${MEMBERSHIP_PHASE_LABELS[phase]} → ${MEMBERSHIP_PHASE_LABELS[next]}`}
        </button>
      )}

      {/* Property vault shortcut */}
      {propertyId && (
        <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-border)" }}>
          <a
            href={`/app/properties/${propertyId}`}
            className="p7-btn p7-btn-ghost p7-btn-sm"
            data-testid="property-vault-link"
          >
            View Property Vault →
          </a>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
            Log systems, appliances, and materials found during this visit.
          </p>
        </div>
      )}
    </div>
  );
}
