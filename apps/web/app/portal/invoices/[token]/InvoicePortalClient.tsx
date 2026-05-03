"use client";

import { useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

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
  stripePublishableKey: string;
}

function cents(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

function PaymentForm({ token, amountCents, onSuccess }: { token: string; amountCents: number; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError("");
    setSubmitting(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) { setError(submitError.message ?? "Payment failed"); return; }

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (confirmError) {
        setError(confirmError.message ?? "Payment failed");
      } else {
        onSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 12 }}>{error}</div>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        style={{ marginTop: 16, width: "100%", padding: "12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: submitting ? "wait" : "pointer" }}
      >
        {submitting ? "Processing…" : `Pay ${cents(amountCents)}`}
      </button>
    </form>
  );
}

export function InvoicePortalClient({ token, invoice, lineItems, stripePublishableKey }: Props) {
  const [status, setStatus] = useState(invoice.status);
  const [paidCents, setPaidCents] = useState(invoice.paid_cents);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const balance = invoice.total_cents - paidCents;
  const isPaid = status === "paid";
  const isVoid = status === "void";
  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date() && !isPaid && !isVoid;

  const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

  const startPayment = useCallback(async () => {
    setPaymentError("");
    setLoadingPayment(true);
    try {
      const res = await fetch(`/api/portal/invoices/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: balance }),
      });
      const data = await res.json();
      if (!res.ok) { setPaymentError(data.error ?? "Could not start payment"); return; }
      setClientSecret(data.clientSecret);
    } finally {
      setLoadingPayment(false);
    }
  }, [token, balance]);

  function handlePaymentSuccess() {
    setPaymentSuccess(true);
    setClientSecret(null);
    setPaidCents(invoice.total_cents);
    setStatus("paid");
  }

  const propertyLine = [invoice.property_address, invoice.property_city, invoice.property_state, invoice.property_zip]
    .filter(Boolean).join(", ");

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "24px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>{invoice.account_name}</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Invoice #{invoice.invoice_number}</h1>
          {propertyLine && <div style={{ color: "#6b7280", marginTop: 4 }}>{propertyLine}</div>}
          <div style={{ color: "#6b7280", marginTop: 2 }}>Billed to: {invoice.client_name}</div>
          {invoice.due_date && (
            <div style={{ color: isOverdue ? "#dc2626" : "#6b7280", marginTop: 2, fontWeight: isOverdue ? 600 : 400 }}>
              Due: {new Date(invoice.due_date).toLocaleDateString()}{isOverdue ? " — Overdue" : ""}
            </div>
          )}
        </div>

        {/* Status banners */}
        {isPaid && (
          <div style={{ background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 8, padding: "12px 16px", marginBottom: 24, color: "#065f46", fontWeight: 600 }}>
            Paid in full{invoice.paid_at ? ` on ${new Date(invoice.paid_at).toLocaleDateString()}` : ""}
          </div>
        )}
        {paymentSuccess && !isPaid && (
          <div style={{ background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 8, padding: "12px 16px", marginBottom: 24, color: "#065f46" }}>
            Payment received! Thank you.
          </div>
        )}
        {isVoid && (
          <div style={{ background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 8, padding: "12px 16px", marginBottom: 24, color: "#6b7280" }}>
            This invoice has been voided.
          </div>
        )}

        {/* Line items */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Description</th>
                <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Qty</th>
                <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Unit</th>
                <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 16px" }}>{item.description}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", color: "#6b7280" }}>{item.quantity}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", color: "#6b7280" }}>{cents(item.unit_price_cents)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500 }}>{cents(item.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ display: "flex", gap: 32, color: "#6b7280", fontSize: 13 }}>
              <span>Subtotal</span><span>{cents(invoice.subtotal_cents)}</span>
            </div>
            {invoice.tax_cents > 0 && (
              <div style={{ display: "flex", gap: 32, color: "#6b7280", fontSize: 13 }}>
                <span>Tax</span><span>{cents(invoice.tax_cents)}</span>
              </div>
            )}
            {paidCents > 0 && paidCents < invoice.total_cents && (
              <div style={{ display: "flex", gap: 32, color: "#6b7280", fontSize: 13 }}>
                <span>Paid</span><span>−{cents(paidCents)}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 32, fontWeight: 700, fontSize: 16, marginTop: 4 }}>
              <span>{isPaid ? "Total" : "Balance due"}</span>
              <span>{cents(isPaid ? invoice.total_cents : balance)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>NOTES</div>
            <div style={{ whiteSpace: "pre-wrap", color: "#374151" }}>{invoice.notes}</div>
          </div>
        )}

        {/* Invoice terms */}
        {invoice.account_settings?.invoice_terms && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>TERMS</div>
            <div style={{ whiteSpace: "pre-wrap", color: "#6b7280", fontSize: 13 }}>{invoice.account_settings.invoice_terms}</div>
          </div>
        )}

        {/* Pay button / Stripe form */}
        {!isPaid && !isVoid && !paymentSuccess && stripePromise && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Pay Online</h3>
            {paymentError && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{paymentError}</div>}
            {!clientSecret ? (
              <button
                type="button"
                onClick={startPayment}
                disabled={loadingPayment}
                style={{ width: "100%", padding: "12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: loadingPayment ? "wait" : "pointer" }}
              >
                {loadingPayment ? "Loading…" : `Pay ${cents(balance)}`}
              </button>
            ) : (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <PaymentForm token={token} amountCents={balance} onSuccess={handlePaymentSuccess} />
              </Elements>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
