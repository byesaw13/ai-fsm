import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageClients } from "@/lib/auth/permissions";
import { queryOne } from "@/lib/db";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

interface PlanRow extends Record<string, unknown> {
  id: string;
  name: string;
  membership_tier: string;
  frequency: string;
  annual_visit_count: number;
  included_labor_minutes_per_visit: number;
  billing_cadence: string;
  annual_price_cents: number;
  monthly_price_cents: number | null;
  renewal_date: string | null;
  routing_zone: string;
  membership_terms: string | null;
  notes: string | null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
}

interface AccountRow extends Record<string, unknown> {
  company_name: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
}

const TIER_LABELS: Record<string, string> = {
  essential: "Essential",
  plus: "Plus",
  premier: "Premier",
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  biannual: "Bi-annual",
  annual: "Annual",
};

const ZONE_LABELS: Record<string, string> = {
  core: "Core Service Zone",
  extended: "Extended Service Zone",
  out_of_area: "Out of Area",
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function EnrollmentSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const plan = await queryOne<PlanRow>(
    `SELECT
       mp.id, mp.name, mp.membership_tier, mp.frequency,
       mp.annual_visit_count, mp.included_labor_minutes_per_visit,
       mp.billing_cadence, mp.annual_price_cents,
       mp.renewal_date, mp.routing_zone,
       mp.membership_terms, mp.notes,
       c.name       AS client_name,
       c.email      AS client_email,
       c.phone      AS client_phone,
       p.address    AS property_address,
       p.city       AS property_city,
       p.state      AS property_state,
       p.zip        AS property_zip
     FROM maintenance_plans mp
     JOIN clients c ON c.id = mp.client_id
     LEFT JOIN properties p ON p.id = mp.property_id
     WHERE mp.id = $1 AND mp.account_id = $2`,
    [id, session.accountId]
  );

  if (!plan) notFound();

  const account = await queryOne<AccountRow>(
    `SELECT
       a.name AS company_name,
       u.full_name AS owner_name,
       u.email     AS owner_email,
       u.phone     AS owner_phone
     FROM accounts a
     LEFT JOIN users u ON u.account_id = a.id AND u.role = 'owner'
     WHERE a.id = $1
     LIMIT 1`,
    [session.accountId]
  );

  const planRef = `PLAN-${plan.id.slice(0, 8).toUpperCase()}`;
  const tierLabel = TIER_LABELS[plan.membership_tier] ?? plan.membership_tier;
  const freqLabel = FREQUENCY_LABELS[plan.frequency] ?? plan.frequency;
  const zoneLabel = ZONE_LABELS[plan.routing_zone] ?? plan.routing_zone;
  const laborCap = plan.included_labor_minutes_per_visit >= 60
    ? `${Math.floor(plan.included_labor_minutes_per_visit / 60)}h ${plan.included_labor_minutes_per_visit % 60 > 0 ? `${plan.included_labor_minutes_per_visit % 60}m` : ""}`.trim()
    : `${plan.included_labor_minutes_per_visit}m`;

  const serviceAddress = [
    plan.property_address,
    [plan.property_city, plan.property_state].filter(Boolean).join(", "),
    plan.property_zip,
  ].filter(Boolean).join(", ");

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        body { font-family: Georgia, serif; color: #111; background: #fff; margin: 0; }
        .wrap { max-width: 780px; margin: 0 auto; padding: 48px 40px; }
        h1 { font-size: 26px; margin: 0; }
        h2 { font-size: 12px; font-weight: 700; text-transform: uppercase;
             letter-spacing: 0.09em; color: #555; margin: 28px 0 8px;
             border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        p { margin: 4px 0; line-height: 1.6; }
        .company-name { font-size: 20px; font-weight: 700; }
        .header-row { display: flex; justify-content: space-between; align-items: flex-start; }
        .meta-label { color: #666; font-size: 12px; }
        .tier-badge { display: inline-block; font-size: 11px; font-weight: 700;
                      text-transform: uppercase; letter-spacing: 0.07em;
                      padding: 3px 10px; border-radius: 4px;
                      background: #111; color: #fff; margin-left: 10px; vertical-align: middle; }
        .meta-table { border-collapse: collapse; margin-top: 8px; width: 100%; }
        .meta-table td { padding: 5px 0; font-size: 14px; vertical-align: top; }
        .meta-table td:first-child { color: #555; width: 220px; font-size: 13px; }
        .terms-block { font-size: 13px; line-height: 1.7; color: #333;
                       border-left: 3px solid #ddd; padding-left: 14px;
                       margin-top: 4px; white-space: pre-wrap; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 24px; }
        .footer { margin-top: 56px; padding-top: 16px; border-top: 1px solid #ddd;
                  font-size: 12px; color: #888; text-align: center; }
        .sig-block { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 48px; }
        .sig-line { border-top: 1px solid #999; padding-top: 6px; font-size: 12px; color: #666; margin-top: 32px; }
      `}</style>

      <PrintButton />

      <div className="wrap">
        {/* Header */}
        <div className="header-row">
          <div>
            <div className="company-name">{account?.company_name ?? "Your Company"}</div>
            {account?.owner_phone && <p style={{ color: "#666", fontSize: 13 }}>{account.owner_phone}</p>}
            {account?.owner_email && <p style={{ color: "#666", fontSize: 13 }}>{account.owner_email}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <h1>
              Membership Enrollment
              <span className="tier-badge">{tierLabel}</span>
            </h1>
            <p className="meta-label">{planRef}</p>
            <p className="meta-label">{fmtDate(new Date().toISOString())}</p>
          </div>
        </div>

        {/* Client + Service Address */}
        <div className="two-col" style={{ marginTop: 32 }}>
          <div>
            <h2 style={{ margin: "0 0 6px" }}>Member</h2>
            <p style={{ fontWeight: 600 }}>{plan.client_name}</p>
            {plan.client_email && <p style={{ fontSize: 14 }}>{plan.client_email}</p>}
            {plan.client_phone && <p style={{ fontSize: 14 }}>{plan.client_phone}</p>}
          </div>
          {serviceAddress && (
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Service Address</h2>
              <p style={{ fontSize: 14 }}>{serviceAddress}</p>
            </div>
          )}
        </div>

        {/* Plan Details */}
        <h2>Plan Details</h2>
        <table className="meta-table">
          <tbody>
            <tr>
              <td>Plan Name</td>
              <td style={{ fontWeight: 600 }}>{plan.name}</td>
            </tr>
            <tr>
              <td>Membership Tier</td>
              <td>{tierLabel}</td>
            </tr>
            <tr>
              <td>Visit Schedule</td>
              <td>{freqLabel} &mdash; {plan.annual_visit_count} visit{plan.annual_visit_count === 1 ? "" : "s"} per year</td>
            </tr>
            <tr>
              <td>Included Labor / Visit</td>
              <td>{laborCap} per visit (additional time billed at standard rate)</td>
            </tr>
            <tr>
              <td>Service Zone</td>
              <td>{zoneLabel}</td>
            </tr>
          </tbody>
        </table>

        {/* Pricing */}
        <h2>Pricing</h2>
        <table className="meta-table">
          <tbody>
            <tr>
              <td>Annual Price</td>
              <td style={{ fontWeight: 600 }}>{fmtPrice(plan.annual_price_cents)}</td>
            </tr>
            <tr>
              <td>Billing</td>
              <td>{plan.billing_cadence === "annual" ? "Billed annually" : "Billed monthly"}</td>
            </tr>
            {plan.renewal_date && (
              <tr>
                <td>Renewal Date</td>
                <td>{fmtDate(plan.renewal_date)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Membership Terms */}
        {plan.membership_terms && (
          <>
            <h2>Membership Terms &amp; Conditions</h2>
            <div className="terms-block">{plan.membership_terms}</div>
          </>
        )}

        {/* Notes */}
        {plan.notes && (
          <>
            <h2>Notes</h2>
            <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{plan.notes}</p>
          </>
        )}

        {/* Signatures */}
        <div className="sig-block">
          <div>
            <div style={{ height: 48 }} />
            <div className="sig-line">Member Signature &amp; Date</div>
          </div>
          <div>
            <div style={{ height: 48 }} />
            <div className="sig-line">{account?.company_name ?? "Company"} Representative &amp; Date</div>
          </div>
        </div>

        <div className="footer">
          {account?.company_name ?? ""} &nbsp;·&nbsp; {planRef} &nbsp;·&nbsp; {tierLabel} Membership
        </div>
      </div>
    </>
  );
}
