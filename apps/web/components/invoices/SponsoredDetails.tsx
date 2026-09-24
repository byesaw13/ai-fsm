import type { SponsoredDocumentInfo } from "@/lib/invoices/sponsored";

/** TASK-158: realtor-sponsored context block shared by print and customer views. */
export function SponsoredDetails({ info }: { info: SponsoredDocumentInfo }) {
  const rows: [string, string][] = [["Paid by", info.paidBy]];
  if (info.beneficiary?.trim()) rows.push(["Work for", info.beneficiary.trim()]);
  rows.push(["Category", "Realtor-sponsored property expense"], ["Purpose", info.purpose]);
  if (info.businessPurpose?.trim()) rows.push(["Business purpose", info.businessPurpose.trim()]);
  return (
    <div className="section-block" data-testid="sponsored-details" style={{ marginTop: 24, marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Realtor-sponsored property expense</h2>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 16px", margin: 0, fontSize: 14 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt style={{ color: "#57534e" }}>{label}</dt>
            <dd style={{ margin: 0 }}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
