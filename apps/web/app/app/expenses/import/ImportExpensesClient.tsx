"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, useToast } from "@/components/ui";

type LineItem = { sku: string | null; name: string; category: string; unit_cost_cents: number; quantity: number };
type Txn = {
  external_ref: string;
  date: string;
  vendor: string;
  job_name: string | null;
  amount_cents: number;
  expense_category: string;
  line_items: LineItem[];
  is_return: boolean;
  already_imported: boolean;
  suggestion: { job_id: string; client_id: string | null; label: string } | null;
};
type Summary = {
  total_transactions: number; new_importable: number; duplicates: number;
  returns_skipped: number; total_cents: number; material_lines: number;
};
type JobOption = { id: string; title: string };

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ImportExpensesClient() {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  // per-transaction chosen job_id (keyed by external_ref); "" = no job
  const [jobChoice, setJobChoice] = useState<Record<string, string>>({});

  async function handleFile(file: File) {
    setParsing(true);
    setSummary(null);
    setTxns([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const [previewRes, jobsRes] = await Promise.all([
        fetch("/api/v1/expenses/import/preview", { method: "POST", body: fd }),
        fetch("/api/v1/jobs?limit=500"),
      ]);
      const previewJson = await previewRes.json().catch(() => ({}));
      if (!previewRes.ok) {
        toast.error(previewJson.error?.message ?? "Could not read that file");
        return;
      }
      const jobsJson = await jobsRes.json().catch(() => ({ data: [] }));
      setJobs((jobsJson.data ?? []).map((j: { id: string; title: string }) => ({ id: j.id, title: j.title })));

      const list: Txn[] = previewJson.data.transactions;
      setTxns(list);
      setSummary(previewJson.data.summary);
      // seed job choices from suggestions
      const seed: Record<string, string> = {};
      for (const t of list) if (t.suggestion) seed[t.external_ref] = t.suggestion.job_id;
      setJobChoice(seed);
    } catch {
      toast.error("Network error reading the file");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runImport() {
    const importable = txns.filter((t) => !t.already_imported && !t.is_return);
    if (importable.length === 0) {
      toast.error("Nothing new to import");
      return;
    }
    setImporting(true);
    try {
      const payload = {
        source: "home_depot_csv",
        transactions: importable.map((t) => {
          const job_id = jobChoice[t.external_ref] || null;
          const job = jobs.find((j) => j.id === job_id);
          return {
            external_ref: t.external_ref,
            date: t.date,
            vendor: t.vendor,
            amount_cents: t.amount_cents,
            expense_category: t.expense_category,
            job_id,
            client_id: job_id ? (t.suggestion?.job_id === job_id ? t.suggestion?.client_id ?? null : null) : null,
            notes: `Home Depot${t.job_name ? ` · ${t.job_name}` : ""}${job ? ` → ${job.title}` : ""}`,
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
      toast.success(`Imported ${d.created} expense(s), updated ${d.materials_upserted} material price(s)`);
      router.push("/app/expenses");
      router.refresh();
    } catch {
      toast.error("Network error during import");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Upload */}
      <Card>
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          In Home Depot Pro Xtra → Purchase Tracking → export to CSV, then upload it here. Each store trip becomes one
          expense (tagged to the job when we can match it), and every SKU updates your material price book.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <button type="button" className="p7-btn p7-btn-primary" disabled={parsing} onClick={() => fileRef.current?.click()}>
          {parsing ? "Reading…" : "Choose CSV file"}
        </button>
      </Card>

      {summary && (
        <Card>
          <div style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap", fontSize: "var(--text-sm)" }}>
            <Stat label="New to import" value={String(summary.new_importable)} accent="var(--accent)" />
            <Stat label="Total" value={dollars(summary.total_cents)} />
            <Stat label="Material prices" value={String(summary.material_lines)} />
            <Stat label="Already imported" value={String(summary.duplicates)} muted />
            <Stat label="Returns skipped" value={String(summary.returns_skipped)} muted />
          </div>
          <div style={{ marginTop: "var(--space-4)", display: "flex", gap: "var(--space-2)" }}>
            <button type="button" className="p7-btn p7-btn-primary" disabled={importing || summary.new_importable === 0} onClick={runImport}>
              {importing ? "Importing…" : `Import ${summary.new_importable} expense${summary.new_importable === 1 ? "" : "s"}`}
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
                  {["Date", "HD job tag", "Items", "Amount", "Category", "Assign to job", "Status"].map((h) => (
                    <th key={h} style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => {
                  const inactive = t.already_imported || t.is_return;
                  return (
                    <tr key={t.external_ref} style={{ borderBottom: "1px solid var(--border-subtle)", opacity: inactive ? 0.5 : 1 }}>
                      <td style={{ padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap" }}>{t.date}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>{t.job_name ?? <span style={{ color: "var(--fg-muted)" }}>—</span>}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>{t.line_items.length}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap", fontWeight: 600 }}>{dollars(t.amount_cents)}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textTransform: "capitalize" }}>{t.expense_category}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        {inactive ? <span style={{ color: "var(--fg-muted)" }}>—</span> : (
                          <select
                            value={jobChoice[t.external_ref] ?? ""}
                            onChange={(e) => setJobChoice((prev) => ({ ...prev, [t.external_ref]: e.target.value }))}
                            style={{ minHeight: 32, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 var(--space-2)", maxWidth: 220, background: "var(--bg-card)" }}
                          >
                            <option value="">No job (general)</option>
                            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap" }}>
                        {t.already_imported ? <Badge text="Already imported" />
                          : t.is_return ? <Badge text="Return / credit" />
                          : t.suggestion ? <Badge text="Matched" accent />
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

function Badge({ text, accent }: { text: string; accent?: boolean }) {
  return (
    <span style={{
      fontSize: "var(--text-xs)", fontWeight: 600, padding: "2px 8px", borderRadius: 99,
      background: accent ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--bg)",
      color: accent ? "var(--accent)" : "var(--fg-muted)", border: "1px solid var(--border)",
    }}>{text}</span>
  );
}
