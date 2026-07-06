"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, LinkButton, SectionHeader } from "@/components/ui";
import { spendToCents, toDateStr, cleanPhone } from "@/lib/clients/csv-parse";

// Square CSV column headers → our field names
// Handles both Square's exact headers and common variations.
const COLUMN_MAP: Record<string, string | null> = {
  "first name":       "first_name",
  "last name":        "last_name",
  "display name":     "name",
  "nickname":         "nickname",
  "email address":    "email",
  "email":            "email",
  "phone number":     "phone",
  "phone":            "phone",
  "company name":     "company_name",
  "company":          "company_name",
  "street address":   "address_line1",
  "street address 1": "address_line1",
  "address line 1":   "address_line1",
  "address":          "address_line1",
  "street address 2": "address_line2",
  "address line 2":   "address_line2",
  "city":             "city",
  "state":            "state",
  "province":         "state",
  "postal code":      "zip",
  "zip":              "zip",
  "zip code":         "zip",
  "notes":            "notes",
  "note":             "notes",
  "memo":             "notes",
  "birthday":         "birthday",
  // Square customer-directory fields
  "square customer id":        "square_customer_id",
  "creation source":           "creation_source",
  "first visit":               "first_visit_at",
  "last visit":                "last_visit_at",
  "transaction count":         "transaction_count",
  "lifetime spend":            "lifetime_spend_cents",
  "email subscription status": "email_subscription_status",
  "instant profile":           "instant_profile",
  "reference id":              null,   // Square internal, ignored
  "country":                   null,
};

interface ParsedRow {
  name: string;
  nickname: string;
  email: string;
  phone: string;
  company_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  birthday: string;
  square_customer_id: string;
  creation_source: string;
  first_visit_at: string;
  last_visit_at: string;
  transaction_count: number;
  lifetime_spend_cents: number;
  email_subscription_status: string;
  instant_profile: boolean;
}

function parseCSV(text: string): { rows: ParsedRow[]; warnings: string[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return { rows: [], warnings: ["CSV appears to be empty."] };

  // Parse a single CSV line, handling quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === "," && !inQuote) {
        fields.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, "").trim());
  const fieldMap: Array<string | null> = headers.map((h) => {
    if (h in COLUMN_MAP) return COLUMN_MAP[h];
    return null; // unknown column, ignored
  });

  const warnings: string[] = [];
  const unmapped = headers.filter((h) => !(h in COLUMN_MAP) && h.length > 0);
  if (unmapped.length > 0) warnings.push(`Ignored unknown columns: ${unmapped.join(", ")}`);

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = parseLine(line);
    const raw: Record<string, string> = {};
    for (let j = 0; j < fieldMap.length; j++) {
      const field = fieldMap[j];
      if (field) raw[field] = (cells[j] ?? "").trim();
    }

    // Build name: prefer display_name, else combine first + last
    const name = (raw.name || `${raw.first_name ?? ""} ${raw.last_name ?? ""}`.trim()).trim();
    if (!name) continue; // skip rows with no name

    rows.push({
      name,
      nickname:      raw.nickname      ?? "",
      email:         raw.email         ?? "",
      phone:         cleanPhone(raw.phone ?? ""),
      company_name:  raw.company_name  ?? "",
      address_line1: raw.address_line1 ?? "",
      address_line2: raw.address_line2 ?? "",
      city:          raw.city          ?? "",
      state:         raw.state         ?? "",
      zip:           raw.zip           ?? "",
      notes:         raw.notes         ?? "",
      birthday:      toDateStr(raw.birthday ?? ""),
      square_customer_id:        raw.square_customer_id ?? "",
      creation_source:           raw.creation_source ?? "",
      first_visit_at:            toDateStr(raw.first_visit_at ?? ""),
      last_visit_at:             toDateStr(raw.last_visit_at ?? ""),
      transaction_count:         parseInt(raw.transaction_count ?? "0", 10) || 0,
      lifetime_spend_cents:      spendToCents(raw.lifetime_spend_cents ?? ""),
      email_subscription_status: raw.email_subscription_status ?? "",
      instant_profile:           /^yes$/i.test((raw.instant_profile ?? "").trim()),
    });
  }

  if (rows.length === 0) warnings.push("No importable rows found. Make sure the CSV has a name column.");

  return { rows, warnings };
}

export function ClientImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows: parsed, warnings: w } = parseCSV(text);
      setRows(parsed);
      setWarnings(w);
      if (parsed.length > 0) setStep("preview");
      else setError("No importable rows found in this CSV.");
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/clients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Import failed");
      } else {
        setResult(data.data);
        setStep("done");
      }
    } catch {
      setError("Unexpected error during import.");
    } finally {
      setImporting(false);
    }
  }

  if (step === "done" && result) {
    return (
      <Card>
        <div style={{ padding: "var(--space-6)", textAlign: "center" }}>
          <p style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-2)" }}>
            Import complete
          </p>
          <p style={{ fontSize: "var(--text-base)", color: "var(--fg-muted)", marginBottom: "var(--space-6)" }}>
            <strong>{result.imported}</strong> client{result.imported !== 1 ? "s" : ""} imported
            {result.skipped > 0 && <>, <strong>{result.skipped}</strong> skipped (already existed)</>}.
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center" }}>
            <LinkButton href="/app/clients" variant="primary">View Clients</LinkButton>
            <Button variant="secondary" onClick={() => { setStep("upload"); setRows([]); setWarnings([]); setResult(null); if (fileRef.current) fileRef.current.value = ""; }}>
              Import Another File
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (step === "preview") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {warnings.length > 0 && (
          <Card>
            <div style={{ padding: "var(--space-3)", background: "#fffbeb", borderRadius: "var(--radius-sm)" }}>
              {warnings.map((w, i) => (
                <p key={i} style={{ fontSize: "var(--text-sm)", color: "#92400e", margin: 0 }}>⚠ {w}</p>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <SectionHeader
            title={`Preview — ${rows.length} client${rows.length !== 1 ? "s" : ""} to import`}
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                  {["Name", "Email", "Phone", "Company", "Address", "City", "State", "Zip", "Txns", "Lifetime", "Last Visit", "Square ID"].map((h) => (
                    <th key={h} style={{ padding: "var(--space-2) var(--space-3)", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 500 }}>{row.name}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)" }}>{row.email || "—"}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)" }}>{row.phone || "—"}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)" }}>{row.company_name || "—"}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)" }}>{row.address_line1 || "—"}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)" }}>{row.city || "—"}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)" }}>{row.state || "—"}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)" }}>{row.zip || "—"}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", textAlign: "right" }}>{row.transaction_count || "—"}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", textAlign: "right", whiteSpace: "nowrap" }}>{row.lifetime_spend_cents ? `$${(row.lifetime_spend_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{row.last_visit_at || "—"}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{row.square_customer_id || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && (
              <p style={{ padding: "var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                Showing first 50 of {rows.length} rows. All {rows.length} will be imported.
              </p>
            )}
          </div>

          {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", padding: "var(--space-3) 0 0" }}>{error}</p>}

          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)", justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => { setStep("upload"); setRows([]); if (fileRef.current) fileRef.current.value = ""; }}>
              Choose Different File
            </Button>
            <Button variant="primary" onClick={handleImport} disabled={importing} loading={importing}>
              {importing ? "Importing…" : `Import ${rows.length} Client${rows.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Upload step
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <Card>
        <SectionHeader title="Step 1 — Export from Square" />
        <ol style={{ fontSize: "var(--text-sm)", lineHeight: 1.8, paddingLeft: "var(--space-5)", color: "var(--fg-muted)" }}>
          <li>Open <strong>Square Dashboard</strong> → <strong>Customers</strong></li>
          <li>Click the <strong>Export</strong> button (top right, may be under a ••• menu)</li>
          <li>Choose <strong>Export as CSV</strong> and save the file</li>
        </ol>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginTop: "var(--space-3)" }}>
          Any CSV works as long as it has columns for name (or first name + last name), email, and/or phone.
          Duplicates (same name + email) are automatically skipped.
        </p>
      </Card>

      <Card>
        <SectionHeader title="Step 2 — Upload your CSV" />
        <div
          style={{
            border: "2px dashed var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-8)",
            textAlign: "center",
            cursor: "pointer",
          }}
          onClick={() => fileRef.current?.click()}
        >
          <p style={{ fontSize: "var(--text-lg)", fontWeight: 500, marginBottom: "var(--space-2)" }}>
            Click to choose a CSV file
          </p>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            .csv files only · max 1,000 clients per import
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={handleFile}
          />
        </div>
        {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginTop: "var(--space-3)" }}>{error}</p>}
      </Card>
    </div>
  );
}
