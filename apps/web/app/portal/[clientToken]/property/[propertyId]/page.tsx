import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { queryOne, query } from "@/lib/db";
import { getPortalSession } from "@/lib/portal/session";
import { computeVaultCompleteness, groupVaultForCustomer, type VaultCategory } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const CONDITION_COLOR: Record<string, { fg: string; bg: string }> = {
  good:         { fg: "#16a34a", bg: "#dcfce7" },
  fair:         { fg: "#d97706", bg: "#fef3c7" },
  poor:         { fg: "#dc2626", bg: "#fee2e2" },
  critical:     { fg: "#7f1d1d", bg: "#fecaca" },
  not_assessed: { fg: "#9ca3af", bg: "#f3f4f6" },
};

const SEVERITY_ICON: Record<string, string> = {
  minor:    "·",
  moderate: "!",
  major:    "!!",
  critical: "⚠",
};

type VaultRow = {
  id: string; name: string; category: VaultCategory; location: string | null;
  manufacturer: string | null; model_number: string | null; serial_number: string | null;
  install_date: string | null; last_serviced_date: string | null; next_service_date: string | null;
  notes: string | null;
};

function formatDate(iso: string) {
  // Date-only values (install/service dates) are calendar days: read them at
  // local noon, or UTC midnight shows the day before in Eastern time.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function PortalPropertyPage({
  params,
}: {
  params: Promise<{ clientToken: string; propertyId: string }>;
}) {
  const { clientToken, propertyId } = await params;

  // Validate token → client
  const client = await queryOne<{ id: string; name: string; account_id: string; account_name: string }>(
    `SELECT c.id, c.name, c.account_id, a.name AS account_name
     FROM clients c
     JOIN accounts a ON a.id = c.account_id
     WHERE c.portal_token = $1`,
    [clientToken]
  );
  if (!client) notFound();

  // The portal token alone never grants access: the browser must hold a portal
  // session for this same client (same rule as the portal home page).
  const session = await getPortalSession();
  if (!session || session.clientId !== client.id) redirect("/portal/login");

  // Validate property belongs to this client
  const property = await queryOne<{
    id: string; name: string | null; address: string;
    city: string | null; state: string | null; zip: string | null;
  }>(
    `SELECT id, name, address, city, state, zip
     FROM properties
     WHERE id = $1 AND client_id = $2 AND account_id = $3`,
    [propertyId, client.id, client.account_id]
  );
  if (!property) notFound();

  const [conditions, issues, vaultItems, recentVisits] = await Promise.all([
    query<{ area: string; condition: string; note: string | null; assessed_at: string }>(
      `SELECT DISTINCT ON (area) area, condition, note, assessed_at::text AS assessed_at
       FROM property_condition_snapshots
       WHERE account_id = $1 AND property_id = $2
       ORDER BY area, assessed_at DESC`,
      [client.account_id, propertyId]
    ),
    query<{ id: string; title: string; severity: string; area: string; occurrence_count: number; last_noted_at: string }>(
      `SELECT id, title, severity, area, occurrence_count, last_noted_at::text AS last_noted_at
       FROM property_issues
       WHERE account_id = $1 AND property_id = $2
         AND status IN ('open','monitoring')
       ORDER BY
         CASE severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 WHEN 'moderate' THEN 3 ELSE 4 END,
         last_noted_at DESC
       LIMIT 10`,
      [client.account_id, propertyId]
    ),
    query<VaultRow>(
      `SELECT id::text, name, category, location, manufacturer, model_number, serial_number,
              install_date::text AS install_date,
              last_serviced_date::text AS last_serviced_date,
              next_service_date::text AS next_service_date,
              notes
       FROM property_vault_items
       WHERE account_id = $1 AND property_id = $2
       ORDER BY category, name`,
      [client.account_id, propertyId]
    ),
    query<{ label: string; occurred_at: string; event_type: string; summary: string }>(
      `SELECT event_type,
              occurred_at::text AS occurred_at,
              summary,
              metadata->>'status'     AS detail
       FROM property_timeline_v
       WHERE account_id = $1 AND property_id = $2
         -- Staff notes never reach customers ('note' events carry their text).
         AND event_type IN ('visit','vault_item')
       ORDER BY occurred_at DESC NULLS LAST
       LIMIT 15`,
      [client.account_id, propertyId]
    ),
  ]);

  const addr = [property.address, property.city, property.state].filter(Boolean).join(", ");
  // TASK-175: the vault the marketing site shows — six categories, empty ones included.
  const vaultGroups = groupVaultForCustomer(vaultItems);
  const completeness = computeVaultCompleteness(vaultItems);
  const title = property.name?.trim() || property.address;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "24px 16px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        <div style={{ marginBottom: 8 }}>
          <Link href={`/portal/${clientToken}`} style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
            ← Back to portal
          </Link>
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{client.account_name}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 2px" }}>{title}</h1>
          <div style={{ fontSize: 14, color: "#6b7280" }}>{addr}</div>
        </div>

        {/* Conditions */}
        {conditions.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Current Conditions</h2>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              {conditions.map((row, idx) => {
                const c = CONDITION_COLOR[row.condition] ?? CONDITION_COLOR.not_assessed;
                return (
                  <div
                    key={row.area}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "11px 16px",
                      borderBottom: idx < conditions.length - 1 ? "1px solid #f3f4f6" : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{row.area}</div>
                      {row.note && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{row.note}</div>}
                    </div>
                    <span style={{ background: c.bg, color: c.fg, borderRadius: 99, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
                      {row.condition === "not_assessed" ? "—" : row.condition.charAt(0).toUpperCase() + row.condition.slice(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Open Issues */}
        {issues.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Items We&apos;re Watching</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  style={{
                    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {SEVERITY_ICON[issue.severity]} {issue.title}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                        {issue.area} · seen {issue.occurrence_count}× · last noted {formatDate(issue.last_noted_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
              These items have come up on multiple visits. We&apos;re monitoring them and will keep you informed.
            </p>
          </section>
        )}

        {/* Home Vault (TASK-175) */}
        <section style={{ marginBottom: 28 }} aria-labelledby="vault-heading">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <h2 id="vault-heading" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Your Home Vault</h2>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                What we&apos;ve recorded about this home. It fills in a little more with every visit.
              </div>
            </div>
            <div style={{ minWidth: 180, flex: "0 1 220px" }} aria-label={`Home Vault ${completeness.percent} percent complete`}>
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>
                <strong style={{ fontSize: 18, color: "#c2410c" }}>{completeness.percent}%</strong> complete
              </div>
              <div style={{ height: 6, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${completeness.percent}%`, height: "100%", background: "#ea580c" }} />
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                {completeness.coveredCount} of {completeness.totalCount} categories recorded
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
            {vaultGroups.map((group) => (
              <div
                key={group.category}
                data-testid={`portal-vault-${group.category}`}
                style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px", opacity: group.items.length ? 1 : 0.75 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{group.label}</h3>
                  {group.items.length > 0 && <span style={{ fontSize: 12, color: "#6b7280" }}>{group.items.length}</span>}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 8px" }}>{group.description}</div>
                {group.items.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>Not recorded yet</div>
                ) : (
                  group.items.map((item) => {
                    const spec = [item.manufacturer, item.model_number].filter(Boolean).join(" · ");
                    const dates = [
                      item.install_date && `Installed ${formatDate(item.install_date)}`,
                      item.last_serviced_date && `Serviced ${formatDate(item.last_serviced_date)}`,
                      item.next_service_date && `Next service ${formatDate(item.next_service_date)}`,
                    ].filter(Boolean).join(" · ");
                    const watch = item.category === "monitor";
                    return (
                      <div
                        key={item.id}
                        style={{
                          borderTop: "1px solid #f3f4f6", padding: "8px 0",
                          ...(watch ? { borderLeft: "3px solid #f59e0b", paddingLeft: 8 } : {}),
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</span>
                          {watch && <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", background: "#fef3c7", borderRadius: 99, padding: "1px 8px" }}>Watch</span>}
                          {item.location && <span style={{ fontSize: 11, color: "#4b5563", background: "#f3f4f6", borderRadius: 99, padding: "1px 8px" }}>{item.location}</span>}
                        </div>
                        {spec && <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{spec}</div>}
                        {item.serial_number && <div style={{ fontSize: 12, color: "#6b7280" }}>Serial {item.serial_number}</div>}
                        {dates && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{dates}</div>}
                        {item.notes && <div style={{ fontSize: 13, color: "#4b5563", marginTop: 2, whiteSpace: "pre-wrap" }}>{item.notes}</div>}
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Visit History */}
        {recentVisits.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Recent Activity</h2>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              {recentVisits.map((ev, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "11px 16px",
                    borderBottom: idx < recentVisits.length - 1 ? "1px solid #f3f4f6" : "none",
                  }}
                >
                  <div style={{ fontSize: 14 }}>{ev.summary}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>
                    {formatDate(ev.occurred_at)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}


      </div>
    </div>
  );
}
