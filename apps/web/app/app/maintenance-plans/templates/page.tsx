import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canManageClients } from "@/lib/auth/permissions";
import { PageContainer, PageHeader, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

interface TemplateRow {
  id: string;
  name: string;
  tier: string;
  description: string | null;
  visit_count_per_year: number;
  included_labor_minutes_per_visit: number;
  base_price_cents: number;
  included_features: string[];
  is_active: boolean;
  sort_order: number;
  active_subscription_count: string;
  [key: string]: unknown;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  essential: { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
  plus:      { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
  premier:   { bg: "#faf5ff", text: "#6b21a8", border: "#e9d5ff" },
};

export default async function PlanTemplatesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const templates = await query<TemplateRow>(
    `SELECT t.*,
            COUNT(mp.id) FILTER (WHERE mp.status = 'active') AS active_subscription_count
     FROM plan_templates t
     LEFT JOIN maintenance_plans mp ON mp.plan_template_id = t.id AND mp.account_id = t.account_id
     WHERE t.account_id = $1
     GROUP BY t.id
     ORDER BY t.sort_order, t.name`,
    [session.accountId]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Membership Templates"
        subtitle="Define your membership tiers — visit counts, labor caps, and base pricing"
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <LinkButton href="/app/maintenance-plans" variant="ghost" size="sm">
              ← Memberships
            </LinkButton>
            <LinkButton href="/app/maintenance-plans/templates/new" variant="primary" size="sm">
              + New Template
            </LinkButton>
          </div>
        }
      />

      {templates.length === 0 ? (
        <div style={{ textAlign: "center", padding: "var(--space-12)", color: "var(--fg-muted)" }}>
          <p style={{ marginBottom: "var(--space-4)" }}>No plan templates yet.</p>
          <LinkButton href="/app/maintenance-plans/templates/new" variant="primary" size="default">
            Create your first template
          </LinkButton>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--space-4)" }}>
          {templates.map((t) => {
            const colors = TIER_COLORS[t.tier] ?? TIER_COLORS.plus;
            const subsCount = parseInt(t.active_subscription_count);
            return (
              <div
                key={t.id}
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                  opacity: t.is_active ? 1 : 0.6,
                }}
              >
                {/* Tier header */}
                <div style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}`, padding: "var(--space-4)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: colors.text }}>
                        {t.tier}
                      </span>
                      <h3 style={{ margin: "var(--space-1) 0 0", fontSize: "var(--font-size-lg)", fontWeight: 700 }}>
                        {t.name}
                      </h3>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {t.base_price_cents > 0 ? (
                        <>
                          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 800 }}>
                            ${(t.base_price_cents / 100).toFixed(0)}
                          </div>
                          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>/year</div>
                        </>
                      ) : (
                        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontStyle: "italic" }}>
                          Price not set
                        </div>
                      )}
                    </div>
                  </div>
                  {t.description && (
                    <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                      {t.description}
                    </p>
                  )}
                </div>

                {/* Specs */}
                <div style={{ padding: "var(--space-4)" }}>
                  <div style={{ display: "flex", gap: "var(--space-4)", marginBottom: "var(--space-3)" }}>
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 2 }}>Visits/year</div>
                      <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}>{t.visit_count_per_year}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 2 }}>Labor cap/visit</div>
                      <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}>{t.included_labor_minutes_per_visit} min</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 2 }}>Active subs</div>
                      <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}>{subsCount}</div>
                    </div>
                  </div>

                  {t.included_features.length > 0 && (
                    <ul style={{ margin: "0 0 var(--space-4)", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                      {t.included_features.map((f, i) => (
                        <li key={i} style={{ fontSize: "var(--font-size-sm)", display: "flex", gap: "var(--space-2)", color: "var(--color-text-secondary)" }}>
                          <span style={{ color: colors.text, flexShrink: 0 }}>✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                    <Link
                      href={`/app/maintenance-plans/templates/${t.id}/edit` as unknown as Route}
                      style={{
                        flex: 1, textAlign: "center", padding: "var(--space-2)", borderRadius: "var(--radius-md)",
                        border: "1px solid var(--color-border)", background: "var(--color-surface)",
                        fontSize: "var(--font-size-sm)", fontWeight: 600, textDecoration: "none", color: "var(--color-text-primary)",
                      }}
                    >
                      Edit Template
                    </Link>
                    {!t.is_active && (
                      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", fontStyle: "italic" }}>Inactive</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
