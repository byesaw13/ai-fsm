"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, useToast } from "@/components/ui";
import { formatCents } from "@ai-fsm/money";

type Mode = "book" | "history";
type LineItem = { sku: string | null; name: string; category: string; unit_cost_cents: number; quantity: number; discounted: boolean };
type ReviewReason = "possible_duplicate" | "conflicting_transaction_id" | "no_transaction_identity";
type Plan =
  | { action: "return" }
  | { action: "already_imported" }
  | { action: "review"; reason: ReviewReason; matchId?: string }
  | { action: "link"; matchId: string }
  | { action: "import" };
type Txn = {
  trip_key: string;
  external_ref: string | null;
  store_number: string | null;
  date: string;
  vendor: string;
  job_name: string | null;
  amount_cents: number;
  expense_category: string;
  line_items: LineItem[];
  is_return: boolean;
  plan: Plan;
  suggestion: { job_id: string; client_id: string | null; label: string } | null;
};
type SkippedRow = { line: number; reason: string; text: string };
type Pending = { count: number; valueCents: number };
type Summary = {
  source: string;
  vendor_label: string;
  mode: Mode;
  rows_read: number;
  total_transactions: number;
  new_importable: number;
  duplicates: number;
  to_review: number;
  returns_skipped: number;
  total_cents: number;
  material_lines: number;
  skipped_rows: SkippedRow[];
  pending: Pending;
};
type Review = {
  id: string;
  mode: Mode;
  reason: ReviewReason;
  status: "pending" | "dismissed";
  value_cents: number;
  payload: { source: string; trip: Omit<Txn, "plan" | "suggestion" | "is_return"> };
  match_expense_id: string | null;
  match: { vendor_name: string; expense_date: string; amount_cents: number } | null;
  dismiss_reason: string | null;
};
type JobOption = { id: string; title: string };

const REASON_TEXT: Record<ReviewReason, string> = {
  possible_duplicate: "Possible match, review",
  conflicting_transaction_id: "Conflicting transaction ID",
  no_transaction_identity: "No store or transaction number",
};
const SKIP_TEXT: Record<string, string> = {
  bad_date: "bad date",
  bad_price: "bad price",
  return: "return",
  zero_line: "$0 line",
};
const DISMISS_REASONS = ["Personal purchase", "Not a business purchase", "Test import"];

const cell = { padding: "var(--space-2) var(--space-3)" } as const;

function pendingText(p: Pending): string {
  return `${p.count} trip${p.count === 1 ? "" : "s"} pending review, ${formatCents(p.valueCents)}`;
}

export function ImportExpensesClient() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("book");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  // per-trip chosen job_id (keyed by trip_key); "" = no job
  const [jobChoice, setJobChoice] = useState<Record<string, string>>({});

  const [reviews, setReviews] = useState<Review[]>([]);
  const [pending, setPending] = useState<Pending>({ count: 0, valueCents: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dismissReason, setDismissReason] = useState(DISMISS_REASONS[0]);
  const [acting, setActing] = useState(false);

  const loadReviews = useCallback(async () => {
    const res = await fetch("/api/v1/expenses/import/reviews");
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setReviews(json.data.reviews);
      setPending(json.data.pending);
      setSelected(new Set());
    }
  }, []);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  async function preview(f: File, m: Mode) {
    setParsing(true);
    setSummary(null);
    setTxns([]);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("mode", m);
      const [previewRes, jobsRes] = await Promise.all([
        fetch("/api/v1/expenses/import/preview", { method: "POST", body: fd }),
        m === "book" ? fetch("/api/v1/jobs?limit=200&open=1") : Promise.resolve(null),
      ]);
      const previewJson = await previewRes.json().catch(() => ({}));
      if (!previewRes.ok) {
        toast.error(previewJson.error?.message ?? "Could not read that file");
        return;
      }
      if (jobsRes) {
        const jobsJson = await jobsRes.json().catch(() => ({ data: [] }));
        setJobs((jobsJson.data ?? []).map((j: { id: string; title: string }) => ({ id: j.id, title: j.title })));
      }
      const list: Txn[] = previewJson.data.transactions;
      setTxns(list);
      setSummary(previewJson.data.summary);
      setPending(previewJson.data.summary.pending);
      const seed: Record<string, string> = {};
      for (const t of list) if (t.suggestion) seed[t.trip_key] = t.suggestion.job_id;
      setJobChoice(seed);
    } catch {
      toast.error("Network error reading the file");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function chooseMode(m: Mode) {
    setMode(m);
    if (file) void preview(file, m);
  }

  async function runImport() {
    if (!summary) return;
    const sendable = txns.filter((t) => t.plan.action !== "return" && t.plan.action !== "already_imported");
    if (sendable.length === 0) {
      toast.error("Nothing new to import");
      return;
    }
    setImporting(true);
    try {
      const payload = {
        source: summary.source,
        mode,
        rows_read: summary.rows_read,
        rejected: summary.skipped_rows.length,
        transactions: sendable.map((t) => {
          const job_id = mode === "book" ? jobChoice[t.trip_key] || null : null;
          const job = jobs.find((j) => j.id === job_id);
          return {
            trip_key: t.trip_key,
            external_ref: t.external_ref,
            store_number: t.store_number,
            date: t.date,
            vendor: t.vendor,
            amount_cents: t.amount_cents,
            expense_category: t.expense_category,
            job_id,
            client_id: job_id && t.suggestion?.job_id === job_id ? t.suggestion.client_id : null,
            notes: `${summary.vendor_label}${t.job_name ? ` · ${t.job_name}` : ""}${job ? ` → ${job.title}` : ""}`,
            line_items: t.line_items,
          };
        }),
      };
      const res = await fetch("/api/v1/expenses/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error?.message ?? "Import failed");
        return;
      }
      const d = json.data;
      const booked = mode === "book" ? `${d.imported} trip(s) booked, ` : "";
      toast.success(`${booked}${d.observations} price(s) recorded, ${d.pending} to review, ${d.alreadyImported} already imported`);
      setSummary(null);
      setTxns([]);
      setFile(null);
      await loadReviews();
    } catch {
      toast.error("Network error during import");
    } finally {
      setImporting(false);
    }
  }

  async function act(ids: string[], action: "same" | "different" | "dismiss" | "reopen") {
    if (ids.length === 0) return;
    setActing(true);
    try {
      const res = await fetch("/api/v1/expenses/import/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, reason: action === "dismiss" ? dismissReason : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && !json.data) {
        toast.error(json.error?.message ?? "Could not save");
      } else if (json.data.failed > 0) {
        const first = json.data.results.find((r: { ok: boolean }) => !r.ok);
        toast.error(`${json.data.failed} not saved: ${first?.error ?? "unchanged"}`);
      } else {
        toast.success(`${json.data.done} saved`);
      }
      await loadReviews();
    } catch {
      toast.error("Network error");
    } finally {
      setActing(false);
    }
  }

  const pendingReviews = reviews.filter((r) => r.status === "pending");
  const dismissed = reviews.filter((r) => r.status === "dismissed");
  const sendableCount = txns.filter((t) => t.plan.action !== "return" && t.plan.action !== "already_imported").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <Card>
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <legend style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>What should this file do?</legend>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="radio" name="mode" checked={mode === "book"} onChange={() => chooseMode("book")} data-testid="import-mode-book" />
            <span>
              <strong>Book purchases</strong>
              <span style={{ display: "block", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                One expense per store trip, with its items and prices. For recent purchases not yet booked.
              </span>
            </span>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="radio" name="mode" checked={mode === "history"} onChange={() => chooseMode("history")} data-testid="import-mode-history" />
            <span>
              <strong>Price history only</strong>
              <span style={{ display: "block", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                Records what you paid for each item. Books nothing: no expenses, no job costs. Use it for your 24-month Pro Xtra export.
              </span>
            </span>
          </label>
        </fieldset>
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          Upload a <strong>Home Depot</strong> Pro Xtra purchase export or a <strong>Lowe&apos;s</strong> purchase-history
          CSV. Importing the same file again adds nothing. A trip that may already be on a receipt waits for you to review it.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFile(f);
              void preview(f, mode);
            }
          }}
        />
        <button type="button" className="p7-btn p7-btn-primary" disabled={parsing} onClick={() => fileRef.current?.click()}>
          {parsing ? "Reading…" : "Choose CSV file"}
        </button>
      </Card>

      {summary && (
        <Card>
          <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", fontWeight: 600 }} data-testid="import-vendor-label">
            Detected: {summary.vendor_label} · {summary.rows_read} rows
          </p>
          <div style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap", fontSize: "var(--text-sm)" }}>
            <Stat label={mode === "book" ? "Trips to book" : "Trips to record"} value={String(summary.new_importable)} accent="var(--accent)" />
            <Stat label="Total" value={formatCents(summary.total_cents)} />
            <Stat label="To review" value={String(summary.to_review)} />
            <Stat label="Already imported" value={String(summary.duplicates)} muted />
            <Stat label="Returns skipped" value={String(summary.returns_skipped)} muted />
            <Stat label="Rows skipped" value={String(summary.skipped_rows.length)} muted />
          </div>
          {summary.skipped_rows.length > 0 && (
            <details style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }} data-testid="import-skipped-rows">
              <summary>Skipped rows ({summary.skipped_rows.length})</summary>
              <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: "var(--space-4)", maxHeight: 240, overflowY: "auto" }}>
                {summary.skipped_rows.map((r) => (
                  <li key={r.line}>
                    Line {r.line}: {SKIP_TEXT[r.reason] ?? r.reason}
                    {r.text ? ` · ${r.text}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div style={{ marginTop: "var(--space-4)", display: "flex", gap: "var(--space-2)" }}>
            <button type="button" className="p7-btn p7-btn-primary" disabled={importing || sendableCount === 0} onClick={runImport}>
              {importing ? "Importing…" : mode === "book" ? "Import and book" : "Record prices"}
            </button>
          </div>
        </Card>
      )}

      {txns.length > 0 && (
        <Card padding="none">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  {["Date", "Store", "PO / job tag", "Items", "Amount", ...(mode === "book" ? ["Assign to job"] : []), "Status"].map((h) => (
                    <th key={h} style={{ ...cell, color: "var(--fg-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => {
                  const inactive = t.plan.action === "already_imported" || t.plan.action === "return";
                  return (
                    <tr key={t.trip_key} style={{ borderBottom: "1px solid var(--border-subtle)", opacity: inactive ? 0.5 : 1 }}>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>{t.date}</td>
                      <td style={cell}>{t.store_number ?? <span style={{ color: "var(--fg-muted)" }}>—</span>}</td>
                      <td style={cell}>{t.job_name ?? <span style={{ color: "var(--fg-muted)" }}>—</span>}</td>
                      <td style={cell}>{t.line_items.length}</td>
                      <td style={{ ...cell, whiteSpace: "nowrap", fontWeight: 600 }}>{formatCents(t.amount_cents)}</td>
                      {mode === "book" && (
                        <td style={cell}>
                          {t.plan.action === "import" || t.plan.action === "link" || t.plan.action === "review" ? (
                            <select
                              value={jobChoice[t.trip_key] ?? ""}
                              onChange={(e) => setJobChoice((prev) => ({ ...prev, [t.trip_key]: e.target.value }))}
                              style={{ minHeight: 32, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 var(--space-2)", maxWidth: 220, background: "var(--bg-card)" }}
                            >
                              <option value="">No job (general)</option>
                              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                            </select>
                          ) : <span style={{ color: "var(--fg-muted)" }}>—</span>}
                        </td>
                      )}
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        {t.plan.action === "already_imported" ? <Badge text="Already imported" />
                          : t.plan.action === "return" ? <Badge text="Return / credit" />
                          : t.plan.action === "review" ? <Badge text={REASON_TEXT[t.plan.reason]} warn />
                          : t.plan.action === "link" ? <Badge text="Same trip as a receipt" accent />
                          : <span style={{ color: "var(--fg-muted)" }}>New</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "var(--space-2)" }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-base)" }}>To review</h2>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }} data-testid="import-pending-summary">
            {pending.count > 0 ? pendingText(pending) : "Nothing pending"}
          </span>
        </div>
        <p style={{ margin: "var(--space-2) 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          These trips are not expenses and teach no prices until you decide. <strong>Same trip</strong> keeps what is
          already on file; <strong>Different trip</strong> records it as its own purchase.
        </p>

        {pendingReviews.length > 0 && (
          <>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-3)" }}>
              <span style={{ fontSize: "var(--text-sm)" }}>{selected.size} selected:</span>
              <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" disabled={acting || selected.size === 0} onClick={() => act([...selected], "same")}>
                Same trip
              </button>
              <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" disabled={acting || selected.size === 0} onClick={() => act([...selected], "different")}>
                Different trip
              </button>
              <select
                aria-label="Reason to dismiss"
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                style={{ minHeight: 32, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-card)" }}
              >
                {DISMISS_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
              <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" disabled={acting || selected.size === 0} onClick={() => act([...selected], "dismiss")}>
                Dismiss
              </button>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {pendingReviews.map((r) => {
                const t = r.payload.trip;
                return (
                  <li key={r.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-sm)" }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            return next;
                          })
                        }
                      />
                      <span style={{ flex: 1 }}>
                        <strong>{t.date} · {t.vendor}{t.store_number ? ` #${t.store_number}` : ""} · {formatCents(r.value_cents)}</strong>
                        {" "}· {t.line_items.length} item(s){t.external_ref ? ` · transaction ${t.external_ref}` : ""}
                        {" "}· {r.mode === "history" ? "price history" : "to book"}
                        <span style={{ display: "block", color: "var(--fg-muted)" }}>
                          {REASON_TEXT[r.reason]}
                          {r.match ? `: receipt ${r.match.vendor_name}, ${r.match.expense_date}, ${formatCents(r.match.amount_cents)}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {dismissed.length > 0 && (
          <details style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>
            <summary>Dismissed ({dismissed.length})</summary>
            <ul style={{ listStyle: "none", margin: "var(--space-2) 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {dismissed.map((r) => (
                <li key={r.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ flex: 1 }}>
                    {r.payload.trip.date} · {r.payload.trip.vendor} · {formatCents(r.value_cents)} · Dismissed: {r.dismiss_reason}
                  </span>
                  <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" disabled={acting} onClick={() => act([r.id], "reopen")}>
                    Reopen
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}

        <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--text-sm)" }}>
          <Link href="/app/expenses">Back to expenses</Link>
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent, muted }: { label: string; value: string; accent?: string; muted?: boolean }) {
  return (
    <div>
      <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: "var(--text-lg)", color: muted ? "var(--fg-muted)" : accent ?? "var(--fg)" }}>{value}</div>
    </div>
  );
}

function Badge({ text, accent, warn }: { text: string; accent?: boolean; warn?: boolean }) {
  const tone = warn ? "var(--status-warning, #b45309)" : accent ? "var(--accent)" : null;
  return (
    <span style={{
      fontSize: "var(--text-xs)", fontWeight: 600, padding: "2px 8px", borderRadius: 99,
      background: tone ? `color-mix(in srgb, ${tone} 12%, transparent)` : "var(--bg)",
      color: tone ?? "var(--fg-muted)", border: "1px solid var(--border)",
    }}>{text}</span>
  );
}
