import { notFound } from "next/navigation";
import Link from "next/link";
import { queryOne, query } from "@/lib/db";

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

  const [conditions, issues, equipment, recentVisits, pinnedNotes] = await Promise.all([
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
    query<{ name: string; category: string; manufacturer: string | null; model_number: string | null; install_date: string | null; last_serviced_date: string | null }>(
      `SELECT name, category, manufacturer, model_number,
              install_date::text AS install_date,
              last_serviced_date::text AS last_serviced_date
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
         AND event_type IN ('visit','note','equipment')
       ORDER BY occurred_at DESC NULLS LAST
       LIMIT 15`,
      [client.account_id, propertyId]
    ),
    query<{ body: string; source: string; created_at: string }>(
      `SELECT body, source, created_at::text AS created_at
       FROM property_notes
       WHERE account_id = $1 AND property_id = $2 AND pinned = true
       ORDER BY created_at DESC`,
      [client.account_id, propertyId]
    ),
  ]);

  const addr = [property.address, property.city, property.state].filter(Boolean).join(", ");
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

        {/* Pinned notes */}
        {pinnedNotes.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            {pinnedNotes.map((note, i) => (
              <div key={i} style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: 14, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#92400e", marginBottom: 4, textTransform: "uppercase" }}>
                  {note.source === "technician" ? "Technician Note" : "Note"}
                </div>
                <div style={{ fontSize: 14, color: "#374151", whiteSpace: "pre-wrap" }}>{note.body}</div>
              </div>
            ))}
          </section>
        )}

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

        {/* Equipment */}
        {equipment.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Equipment on File</h2>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              {equipment.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "11px 16px",
                    borderBottom: idx < equipment.length - 1 ? "1px solid #f3f4f6" : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{item.name}</div>
                      {item.manufacturer && (
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {item.manufacturer}{item.model_number ? ` · ${item.model_number}` : ""}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, color: "#9ca3af" }}>
                      {item.install_date && <div>Installed {formatDate(item.install_date)}</div>}
                      {item.last_serviced_date && <div>Serviced {formatDate(item.last_serviced_date)}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

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

        {conditions.length === 0 && issues.length === 0 && equipment.length === 0 && recentVisits.length === 0 && (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: 48 }}>
            No history recorded for this property yet.
          </div>
        )}

      </div>
    </div>
  );
}
