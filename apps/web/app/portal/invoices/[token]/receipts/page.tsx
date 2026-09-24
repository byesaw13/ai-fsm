import { notFound } from "next/navigation";
import { getPool, queryOne } from "@/lib/db";
import { loadItemizedReceipts } from "@/lib/invoices/itemized-receipts";

export const dynamic = "force-dynamic";

// Public itemized receipts behind an invoice's materials (TASK-157). Only
// billable receipts/items; internal receipt notes are never shown.

function cents(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

function fmtDate(d: string) {
  return new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function InvoiceReceiptsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await queryOne<{
    account_id: string;
    job_id: string | null;
    invoice_number: string;
    account_name: string;
    property_address: string | null;
  }>(
    `SELECT i.account_id, i.job_id, i.invoice_number, a.name AS account_name, p.address AS property_address
     FROM invoices i
     JOIN accounts a ON a.id = i.account_id
     LEFT JOIN properties p ON p.id = i.property_id
     WHERE i.share_token = $1 AND i.show_itemized_receipts = true AND i.status <> 'void'`,
    [token],
  );
  if (!invoice?.job_id) notFound();

  const { receipts, total_cents } = await loadItemizedReceipts(getPool(), invoice.account_id, invoice.job_id);

  const cell = { padding: "6px 16px", fontSize: 13 } as const;
  return (
    <div style={{ minHeight: "100vh", background: "#f8f7f6", padding: "32px 16px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <a href={`/portal/invoices/${token}`} style={{ fontSize: 13, color: "#2563eb" }}>
          ← Back to invoice {invoice.invoice_number}
        </a>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#57534e", margin: "16px 0 2px" }}>{invoice.account_name}</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Itemized receipts</h1>
        <div style={{ marginTop: 6, fontSize: 14, color: "#57534e" }}>
          Materials and disposal purchased for {invoice.property_address ?? "this job"} ·{" "}
          {receipts.length} receipts · <strong>{cents(total_cents)}</strong>
        </div>

        {receipts.map((r) => (
          <div key={r.id} style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 10, marginTop: 16, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", background: "#fafaf9", borderBottom: "1px solid #e7e5e4", fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>
                {r.vendor_name} <span style={{ fontWeight: 400, color: "#78716c" }}>· {fmtDate(r.expense_date)}</span>
              </span>
              <span style={{ fontWeight: 700, fontFamily: "monospace" }}>{cents(r.total_cents)}</span>
            </div>
            {r.itemized ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {r.items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: i < r.items.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                      <td style={cell}>{item.name}</td>
                      <td style={{ ...cell, textAlign: "right", color: "#78716c", whiteSpace: "nowrap" }}>
                        {item.quantity} × {cents(item.unit_cost_cents)}
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontFamily: "monospace", whiteSpace: "nowrap" }}>{cents(item.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ ...cell, color: "#78716c" }}>Receipt total (not itemized)</div>
            )}
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, padding: "12px 16px", borderTop: "2px solid #166534", fontWeight: 800, fontSize: 16, color: "#166534" }}>
          <span>Total receipts</span>
          <span style={{ fontFamily: "monospace" }}>{cents(total_cents)}</span>
        </div>
      </div>
    </div>
  );
}
