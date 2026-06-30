"use client";

import { useState, useCallback } from "react";
import { DOCUMENT_STANDARD_VERSION, STANDARD_INVOICE_TERMS } from "@ai-fsm/domain";

interface LineItem {
  id: string;
  description: string;
  quantity: string;
  unit_price_cents: number;
  total_cents: number;
}

interface Invoice {
  status: string;
  invoice_number: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  deposit_cents: number | null;
  notes: string | null;
  due_date: string | null;
  paid_at: string | null;
  client_name: string;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  account_name: string;
  account_settings: { invoice_terms?: string };
}

interface Props {
  token: string;
  invoice: Invoice;
  lineItems: LineItem[];
  /** Whether the account has Square enabled — controls the online pay button. */
  onlinePaymentAvailable: boolean;
}

function cents(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

export function InvoicePortalClient({ token, invoice, lineItems, onlinePaymentAvailable }: Props) {
  const [status] = useState(invoice.status);
  const [paidCents] = useState(invoice.paid_cents);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const balance = invoice.total_cents - paidCents;
  const isPaid = status === "paid";
  const isVoid = status === "void";
  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date() && !isPaid && !isVoid;

  // Redirect to the Square-hosted checkout page for the balance. On return, the
  // Square webhook updates the invoice; the client sees it reflected on reload.
  const startPayment = useCallback(async () => {
    setPaymentError("");
    setLoadingPayment(true);
    try {
      const res = await fetch(`/api/portal/invoices/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setPaymentError(data.error ?? "Could not start payment");
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setPaymentError("Could not start payment. Please try again.");
    } finally {
      setLoadingPayment(false);
    }
  }, [token]);

  const propertyLine = [invoice.property_address, invoice.property_city, invoice.property_state, invoice.property_zip]
    .filter(Boolean).join(", ");
  const invoiceTerms = invoice.account_settings?.invoice_terms ?? STANDARD_INVOICE_TERMS;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7f6", padding: "32px 16px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header — clean and direct */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#57534e", marginBottom: 2 }}>{invoice.account_name}</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Invoice {invoice.invoice_number}</h1>

          <div style={{ marginTop: 8, fontSize: 14, color: "#57534e" }}>
            {propertyLine && <div>{propertyLine}</div>}
            <div>Billed to {invoice.client_name}</div>
            {invoice.due_date && (
              <div style={{ marginTop: 2, color: isOverdue ? "#b91c1c" : "#57534e", fontWeight: isOverdue ? 600 : 400 }}>
                Due {new Date(invoice.due_date).toLocaleDateString()} {isOverdue ? "— OVERDUE" : ""}
              </div>
            )}
          </div>
        </div>

        {/* Prominent money callout */}
        <div style={{
          display: "flex",
          gap: 32,
          alignItems: "baseline",
          padding: "16px 20px",
          background: "#fff",
          border: "1px solid #e7e5e4",
          borderRadius: 10,
          marginBottom: 20
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#78716c" }}>TOTAL</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-mono, monospace)", lineHeight: 1 }}>{cents(invoice.total_cents)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#78716c" }}>BALANCE</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-mono, monospace)", lineHeight: 1, color: balance > 0 ? "#b91c1c" : "#166534" }}>
              {cents(balance)}
            </div>
          </div>
          {invoice.paid_cents > 0 && (
            <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 13 }}>
              Paid {cents(invoice.paid_cents)}
            </div>
          )}
        </div>

        {/* Status banners */}
        {isPaid && (
          <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", marginBottom: 20, color: "#166534", fontWeight: 600, fontSize: 14 }}>
            ✓ Paid in full{invoice.paid_at ? ` — ${new Date(invoice.paid_at).toLocaleDateString()}` : ""}
          </div>
        )}
        {isVoid && (
          <div style={{ background: "#f5f5f4", border: "1px solid #d6d3d1", borderRadius: 8, padding: "10px 14px", marginBottom: 20, color: "#57534e" }}>
            This invoice has been voided.
          </div>
        )}

        {/* Line items */}
        <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#fafaf9", borderBottom: "1px solid #e7e5e4" }}>
                <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 600, color: "#57534e" }}>Description</th>
                <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 11, fontWeight: 600, color: "#57534e" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 16px" }}>{item.description}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500 }}>{cents(item.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "14px 16px", borderTop: "1px solid #e7e5e4", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, fontSize: 14 }}>
            <div style={{ display: "flex", gap: 36, color: "#57534e" }}>
              <span>Subtotal</span><span style={{ fontFamily: "monospace" }}>{cents(invoice.subtotal_cents)}</span>
            </div>
            {invoice.tax_cents > 0 && (
              <div style={{ display: "flex", gap: 36, color: "#57534e" }}>
                <span>Tax</span><span style={{ fontFamily: "monospace" }}>{cents(invoice.tax_cents)}</span>
              </div>
            )}
            {paidCents > 0 && (
              <div style={{ display: "flex", gap: 36, color: "#15803d" }}>
                <span>Paid</span><span style={{ fontFamily: "monospace" }}>−{cents(paidCents)}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 36, fontWeight: 700, fontSize: 17, paddingTop: 4, borderTop: "1px solid #d6d3d1", marginTop: 4 }}>
              <span>{isPaid ? "Total" : "Balance due"}</span>
              <span style={{ fontFamily: "monospace", color: balance > 0 ? "#b91c1c" : "#166534" }}>{cents(isPaid ? invoice.total_cents : balance)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#78716c", marginBottom: 4 }}>NOTES</div>
            <div style={{ whiteSpace: "pre-wrap", color: "#44403c" }}>{invoice.notes}</div>
          </div>
        )}

        {/* Terms */}
        {invoiceTerms && (
          <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.45, marginBottom: 24, padding: "0 4px" }}>
            {invoiceTerms}
          </div>
        )}

        {/* Pay action */}
        {!isPaid && !isVoid && onlinePaymentAvailable && (
          <div style={{ marginBottom: 24 }}>
            <button
              type="button"
              onClick={startPayment}
              disabled={loadingPayment}
              style={{
                width: "100%",
                padding: "14px",
                background: "#166534",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 700,
                cursor: loadingPayment ? "default" : "pointer"
              }}
            >
              {loadingPayment ? "Starting secure checkout…" : `Pay ${cents(balance)} by card`}
            </button>
            <div style={{ textAlign: "center", fontSize: 11, color: "#78716c", marginTop: 8 }}>Secure payment powered by Square</div>
            {paymentError && <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 8, textAlign: "center" }}>{paymentError}</div>}
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: 12, color: "#a8a29e" }}>
          Contact {invoice.account_name} about this invoice.
        </div>
      </div>
    </div>
  );
}
