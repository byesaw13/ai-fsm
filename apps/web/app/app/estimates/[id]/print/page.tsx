import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withEstimateContext } from "@/lib/estimates/db";
import { getStandardEstimateTerms, formatCents } from "@/lib/estimates/pricing";
import {
  PAYMENT_OPTIONS,
  computeEstimate,
  roomSpecsToEstimateSpec,
  buildShoppingListFromEstimateResult,
  CURRENT_RULES,
} from "@ai-fsm/domain";
import type { EstimateStatus, RoomSpec } from "@ai-fsm/domain";
import { PrintButton } from "./PrintButton";
import { buildClientDocumentFilename } from "@/lib/estimates/guardrails";

export const dynamic = "force-dynamic";

interface EstimateRow {
  id: string;
  status: EstimateStatus;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  notes: string | null;
  sent_at: string | null;
  expires_at: string | null;
  created_at: string;
  sq_ft: number | null;
  prep_level: number | null;
  includes_trim: boolean;
  includes_ceiling: boolean;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address_line1: string | null;
  client_city: string | null;
  client_state: string | null;
  client_zip: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  job_title: string | null;
  shopping_list_json: unknown | null;
  room_specs: unknown | null;
}

interface LineItemRow {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
  visible_to_customer: boolean;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function addr(line1: string | null, city: string | null, state: string | null, zip: string | null): string {
  const parts = [line1, [city, state].filter(Boolean).join(", "), zip].filter(Boolean);
  return parts.join("\n");
}

export default async function EstimatePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const result = await withEstimateContext(session, async (client) => {
    const estResult = await client.query(
      `SELECT
         e.id, e.status,
         e.subtotal_cents, e.tax_cents, e.total_cents,
         COALESCE(e.deposit_cents, 0) AS deposit_cents,
         COALESCE(e.balance_cents, 0) AS balance_cents,
         e.notes, e.sent_at, e.expires_at, e.created_at,
         e.sq_ft, e.prep_level, e.includes_trim, e.includes_ceiling,
         e.shopping_list_json, e.room_specs,
         c.name   AS client_name,
         c.email  AS client_email,
         c.phone  AS client_phone,
         c.address_line1 AS client_address_line1,
         c.city   AS client_city,
         c.state  AS client_state,
         c.zip    AS client_zip,
         p.address AS property_address,
         p.city    AS property_city,
         p.state   AS property_state,
         p.zip     AS property_zip,
         j.title   AS job_title
       FROM estimates e
       LEFT JOIN clients    c ON c.id = e.client_id
       LEFT JOIN properties p ON p.id = e.property_id
       LEFT JOIN jobs       j ON j.id = e.job_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [id, session.accountId]
    );

    if (estResult.rowCount === 0) return null;

    const liResult = await client.query(
      `SELECT id, description, quantity, unit_price_cents, total_cents,
              sort_order, visible_to_customer
       FROM estimate_line_items
       WHERE estimate_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [id]
    );

    return {
      estimate: estResult.rows[0] as EstimateRow,
      lineItems: liResult.rows as LineItemRow[],
    };
  });

  if (!result) notFound();

  const { estimate, lineItems } = result;
  const terms = getStandardEstimateTerms();

  // Only show customer-visible line items
  const customerItems = lineItems.filter((i) => i.visible_to_customer);

  const estimateNumber = `EST-${estimate.id.slice(0, 8).toUpperCase()}`;
  const issuedDate = fmtDate(estimate.sent_at ?? estimate.created_at);
  const expiryDate = fmtDate(estimate.expires_at);
  const documentFilename = buildClientDocumentFilename({
    date: estimate.sent_at ?? estimate.created_at,
    clientName: estimate.client_name,
    jobType: estimate.job_title ?? "Project",
    documentType: "estimate",
    status: estimate.status === "declined" || estimate.status === "expired" ? "archived" : estimate.status,
  });

  const serviceAddress = estimate.property_address
    ? addr(estimate.property_address, estimate.property_city, estimate.property_state, estimate.property_zip)
    : null;

  const clientAddr = addr(estimate.client_address_line1, estimate.client_city, estimate.client_state, estimate.client_zip);

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        body { font-family: Georgia, serif; color: #111; background: #fff; margin: 0; }
        .wrap { max-width: 780px; margin: 0 auto; padding: 48px 40px; }
        h1 { font-size: 28px; margin: 0; }
        h2 { font-size: 14px; font-weight: 600; text-transform: uppercase;
             letter-spacing: 0.08em; color: #555; margin: 32px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        p { margin: 4px 0; line-height: 1.5; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #222;
             font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
        td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 14px; vertical-align: top; }
        .amt { text-align: right; }
        tfoot td { font-weight: 600; border-top: 2px solid #222; border-bottom: none; }
        tfoot tr.total-row td { font-size: 16px; }
        tfoot tr.deposit-row td { color: #444; font-size: 13px; }
        .terms { font-size: 13px; color: #444; line-height: 1.6; white-space: pre-wrap; }
        .standard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 28px; }
        .standard-grid h3 { font-size: 12px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.06em; }
        .standard-grid p { font-size: 13px; color: #444; margin: 0; }
        .section-block { margin-top: 24px; }
        .header-row { display: flex; justify-content: space-between; align-items: flex-start; }
        .company-name { font-size: 20px; font-weight: 700; }
        .meta-label { color: #666; font-size: 12px; }
        .print-btn { position: fixed; top: 16px; right: 16px; padding: 8px 20px;
                     background: #111; color: #fff; border: none; border-radius: 6px;
                     cursor: pointer; font-size: 14px; }
      `}</style>

      <PrintButton />

      <div className="wrap">
        {/* Header */}
        <div className="header-row">
          <div>
            <div className="company-name">Dovetails Services LLC</div>
            <p style={{ color: "#666", fontSize: 13 }}>Licensed &amp; Insured</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <h1>Estimate</h1>
            <p className="meta-label">{estimateNumber}</p>
            <p className="meta-label no-print">{documentFilename}</p>
            <p className="meta-label">Document standard: {terms.version}</p>
            <p className="meta-label">Issued: {issuedDate}</p>
            {estimate.expires_at && (
              <p className="meta-label">Valid through: {expiryDate}</p>
            )}
          </div>
        </div>

        {/* Client + Service Address */}
        <div style={{ display: "flex", gap: 48, marginTop: 32 }}>
          <div>
            <h2 style={{ margin: "0 0 6px" }}>Bill To</h2>
            <p style={{ fontWeight: 600 }}>{estimate.client_name ?? "—"}</p>
            {estimate.client_email && <p>{estimate.client_email}</p>}
            {estimate.client_phone && <p>{estimate.client_phone}</p>}
            {clientAddr && (
              <p style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{clientAddr}</p>
            )}
          </div>
          {serviceAddress && (
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Service Address</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{serviceAddress}</p>
            </div>
          )}
        </div>

        {/* Scope */}
        {estimate.job_title && (
          <div className="section-block">
            <h2>Scope of Work</h2>
            <p>{estimate.job_title}</p>
          </div>
        )}

        {/* Painting Scope */}
        {estimate.sq_ft !== null && (
          <div className="section-block">
            <h2>Painting Scope</h2>
            <p><strong>Area:</strong> {Number(estimate.sq_ft).toLocaleString()} square feet</p>
            <p><strong>Prep Level:</strong> {estimate.prep_level} of 10</p>
            <p><strong>Trim:</strong> {estimate.includes_trim ? "Included" : "Not included"}</p>
            <p><strong>Ceiling:</strong> {estimate.includes_ceiling ? "Included" : "Not included"}</p>
          </div>
        )}

        {/* Estimated Materials — from shopping_list or room_specs */}
        {(() => {
          // Prefer shopping_list_json (already computed at estimate creation)
          type SLSection = { section: string; specified_items: Array<{ name: string; units_to_order: number; unit_label: string }>; computed_items: Array<{ material: { material_name: string; unit: string }; quantity: number }> };
          const sl = estimate.shopping_list_json as { sections?: SLSection[] } | null;
          const hasSL = sl?.sections && sl.sections.length > 0;

          // Fallback: recompute from room_specs
          let roomItems: Array<{ item: string; qty: number; unit: string }> = [];
          if (!hasSL && estimate.room_specs) {
            const rooms = estimate.room_specs as RoomSpec[];
            if (Array.isArray(rooms) && rooms.length > 0) {
              const options = { coat_count: 2, occupied_home: false, vaulted_ceilings: false };
              const spec = roomSpecsToEstimateSpec(rooms, options);
              const engine = computeEstimate(spec, CURRENT_RULES);
              const sl = buildShoppingListFromEstimateResult(engine, rooms, options);
              roomItems = (sl?.sections[0]?.specified_items ?? []).map((item) => ({
                item: item.name,
                qty: item.quantity_needed,
                unit: item.unit_label,
              }));
            }
          }

          if (!hasSL && roomItems.length === 0) return null;

          return (
            <div className="section-block">
              <h2>Estimated Materials</h2>
              <p style={{ fontSize: "0.85em", color: "#555", marginBottom: 8 }}>
                These are estimated quantities. Actual materials may vary based on conditions found on site.
              </p>
              {hasSL ? (
                sl!.sections!.map((sec) => (
                  <div key={sec.section} style={{ marginBottom: 8 }}>
                    <strong style={{ fontSize: "0.9em" }}>{sec.section}</strong>
                    {[...sec.specified_items.map(m => `${m.name} — ${m.units_to_order} ${m.unit_label}`),
                       ...sec.computed_items.map(m => `${m.material.material_name} — ${m.quantity} ${m.material.unit}`)
                    ].map((row, i) => <p key={i} style={{ margin: "2px 0", fontSize: "0.85em" }}>{row}</p>)}
                  </div>
                ))
              ) : (
                roomItems.map((item, i) => (
                  <p key={i} style={{ margin: "2px 0", fontSize: "0.85em" }}>{item.item} — {item.qty} {item.unit}</p>
                ))
              )}
            </div>
          );
        })()}

        <div className="section-block">
          <h2>Project Standards</h2>
          <div className="standard-grid">
            <div>
              <h3>Preparation</h3>
              <p>{terms.sections.preparation}</p>
            </div>
            <div>
              <h3>Repair / Install Work</h3>
              <p>{terms.sections.repair_install_work}</p>
            </div>
            <div>
              <h3>Finish Work</h3>
              <p>{terms.sections.finish_work}</p>
            </div>
            <div>
              <h3>Materials</h3>
              <p>{terms.sections.materials}</p>
            </div>
            <div>
              <h3>Exclusions</h3>
              <p>{terms.sections.exclusions}</p>
            </div>
            <div>
              <h3>Client Responsibilities</h3>
              <p>{terms.sections.client_responsibilities}</p>
            </div>
          </div>
        </div>


        {/* Line Items */}
        {customerItems.length > 0 && (
          <div className="section-block">
            <h2>Line Items</h2>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ width: 60 }}>Qty</th>
                  <th className="amt" style={{ width: 110 }}>Unit Price</th>
                  <th className="amt" style={{ width: 110 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {customerItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td className="amt">{formatCents(item.unit_price_cents)}</td>
                    <td className="amt">{formatCents(item.total_cents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {estimate.tax_cents > 0 && (
                  <tr>
                    <td colSpan={3}>Subtotal</td>
                    <td className="amt">{formatCents(estimate.subtotal_cents)}</td>
                  </tr>
                )}
                {estimate.tax_cents > 0 && (
                  <tr>
                    <td colSpan={3}>Tax</td>
                    <td className="amt">{formatCents(estimate.tax_cents)}</td>
                  </tr>
                )}
                <tr className="total-row">
                  <td colSpan={3}>Total</td>
                  <td className="amt">{formatCents(estimate.total_cents)}</td>
                </tr>
                {estimate.deposit_cents > 0 && (
                  <>
                    <tr className="deposit-row">
                      <td colSpan={3}>Deposit due</td>
                      <td className="amt">{formatCents(estimate.deposit_cents)}</td>
                    </tr>
                    <tr className="deposit-row">
                      <td colSpan={3}>Balance Due Upon Completion</td>
                      <td className="amt">{formatCents(estimate.balance_cents)}</td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </div>
        )}

        {/* Flat-rate total (no line items) */}
        {customerItems.length === 0 && estimate.total_cents > 0 && (
          <div className="section-block">
            <h2>Price</h2>
            <table>
              <tfoot>
                <tr className="total-row">
                  <td>Total</td>
                  <td className="amt">{formatCents(estimate.total_cents)}</td>
                </tr>
                {estimate.deposit_cents > 0 && (
                  <>
                    <tr className="deposit-row">
                      <td>Deposit due</td>
                      <td className="amt">{formatCents(estimate.deposit_cents)}</td>
                    </tr>
                    <tr className="deposit-row">
                      <td>Balance Due Upon Completion</td>
                      <td className="amt">{formatCents(estimate.balance_cents)}</td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </div>
        )}

        {/* Notes */}
        {estimate.notes && (
          <div className="section-block">
            <h2>Notes</h2>
            <p className="terms">{estimate.notes}</p>
          </div>
        )}

        {/* Standard Terms */}
        <div className="section-block">
          <h2>Estimate Terms</h2>
          <p className="terms">{terms.notes}</p>
        </div>

        <div className="section-block">
          <h2>Payment Terms</h2>
          <p className="terms">{terms.payment_terms}</p>
          <div style={{ marginTop: 12 }}>
            {PAYMENT_OPTIONS.map((opt) => (
              <p key={opt} style={{ fontSize: 13, color: "#444" }}>• {opt}</p>
            ))}
          </div>
        </div>

        <div className="section-block">
          <h2>Disclaimer</h2>
          <p className="terms">{terms.disclaimer}</p>
        </div>

        {/* Signature line */}
        <div style={{ marginTop: 48, display: "flex", gap: 64 }}>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6, minWidth: 220 }}>
              <p style={{ fontSize: 12, color: "#666" }}>Authorized by Dovetails Services LLC</p>
            </div>
          </div>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6, minWidth: 220 }}>
              <p style={{ fontSize: 12, color: "#666" }}>Client acceptance &amp; date</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
