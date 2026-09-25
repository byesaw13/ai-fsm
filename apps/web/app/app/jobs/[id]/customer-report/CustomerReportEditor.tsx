"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REPORT_AREAS, REPORT_WORK_TYPES, type ReportRecord } from "@/lib/job-reports/logic";
import type { ReportPhoto } from "@/lib/job-reports/load";

interface Draft {
  title: string;
  summary: string;
  area: string | null;
  work_type: string | null;
  media_ids: string[];
  records: ReportRecord[];
}

const field = {
  width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 15, boxSizing: "border-box" as const, background: "var(--bg-card)", color: "var(--fg)",
};
const h = { margin: "20px 0 8px", fontSize: "var(--text-md)", fontWeight: 700 };

export function CustomerReportEditor(props: {
  jobId: string;
  blockedReason: string | null;
  sponsored: boolean;
  canEmail: boolean;
  canText: boolean;
  photos: ReportPhoto[];
  materialLines: string[];
  initial: Draft;
  status: "draft" | "published" | "withdrawn" | null;
  url: string | null;
  views: number;
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(props.initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function post(payload: Record<string, unknown>, label: string) {
    setBusy(label);
    setMsg(null);
    const res = await fetch(`/api/v1/jobs/${props.jobId}/customer-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg({ ok: false, text: json?.error?.message ?? "Something went wrong." });
      return false;
    }
    router.refresh();
    return true;
  }

  const save = (action: "save" | "publish") =>
    post({ action, ...d }, action).then((ok) => ok && setMsg({ ok: true, text: action === "publish" ? "Published. Send it below." : "Draft saved." }));

  const togglePhoto = (id: string) =>
    setD({ ...d, media_ids: d.media_ids.includes(id) ? d.media_ids.filter((x) => x !== id) : [...d.media_ids, id] });
  const hasRecord = (line: string) => d.records.some((r) => r.detail === line);
  const toggleLine = (line: string) =>
    setD({ ...d, records: hasRecord(line) ? d.records.filter((r) => r.detail !== line) : [...d.records, { label: "", detail: line }] });
  const setRecord = (i: number, patch: Partial<ReportRecord>) =>
    setD({ ...d, records: d.records.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const published = props.status === "published";

  return (
    <div style={{ maxWidth: 760 }}>
      {props.blockedReason && (
        <div role="alert" style={{ background: "var(--bg-warning, #fef3c7)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
          {props.blockedReason}
        </div>
      )}
      {published && props.url && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700 }}>Published · {props.views === 0 ? "not opened yet" : `opened ${props.views}×`}</div>
          <div style={{ fontSize: 13, color: "var(--fg-muted)", wordBreak: "break-all", margin: "4px 0 10px" }}>{props.url}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="p7-btn p7-btn-sm" onClick={() => navigator.clipboard.writeText(props.url!).then(() => setCopied(true))}>
              {copied ? "Copied" : "Copy link"}
            </button>
            {props.canText && (
              <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" disabled={!!busy}
                onClick={() => post({ action: "send", channel: "sms" }, "sms").then((ok) => ok && setMsg({ ok: true, text: "Texted." }))}>
                Text it
              </button>
            )}
            {props.canEmail && (
              <button type="button" className="p7-btn p7-btn-sm" disabled={!!busy}
                onClick={() => post({ action: "send", channel: "email" }, "email").then((ok) => ok && setMsg({ ok: true, text: "Emailed." }))}>
                Email it
              </button>
            )}
            <a className="p7-btn p7-btn-sm" href={props.url} target="_blank" rel="noopener noreferrer">View as customer</a>
            <button type="button" className="p7-btn p7-btn-sm" disabled={!!busy}
              onClick={() => confirm("Take this report down? The link stops working.") && post({ action: "withdraw" }, "withdraw")}>
              Withdraw
            </button>
          </div>
        </div>
      )}
      {props.status === "withdrawn" && (
        <div style={{ color: "var(--fg-muted)", marginBottom: 12 }}>Withdrawn — the old link no longer works. Publish again for a new link.</div>
      )}

      <label htmlFor="cr-title" style={h}>Title</label>
      <input id="cr-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} style={field} />

      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <label style={{ flex: 1, minWidth: 180 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Area</span>
          <select value={d.area ?? ""} onChange={(e) => setD({ ...d, area: e.target.value || null })} style={field}>
            <option value="">Pick one…</option>
            {Object.entries(REPORT_AREAS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 180 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Type</span>
          <select value={d.work_type ?? ""} onChange={(e) => setD({ ...d, work_type: e.target.value || null })} style={field}>
            <option value="">Pick one…</option>
            {Object.entries(REPORT_WORK_TYPES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      </div>

      <h3 style={h}>Photos <span style={{ fontWeight: 400, color: "var(--fg-muted)" }}>· {d.media_ids.length} chosen</span></h3>
      {props.photos.length === 0 ? (
        <p style={{ color: "var(--fg-muted)", margin: 0 }}>No photos on this job. Before/after photos from visits show up here.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 6 }}>
          {props.photos.map((p) => {
            const on = d.media_ids.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => togglePhoto(p.id)} aria-pressed={on}
                style={{ position: "relative", padding: 0, border: on ? "3px solid var(--accent, #1d4ed8)" : "3px solid transparent", borderRadius: 10, overflow: "hidden", aspectRatio: "1", cursor: "pointer", opacity: on ? 1 : 0.55, background: "var(--bg-card)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1/visits/${p.visit_id}/media/${p.id}/image`} alt={p.category} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <span style={{ position: "absolute", left: 4, bottom: 4, background: "rgba(0,0,0,.65)", color: "#fff", fontSize: 10, padding: "1px 5px", borderRadius: 5, textTransform: "capitalize" }}>
                  {on ? "✓ " : ""}{p.category}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <label htmlFor="cr-summary" style={h}>What we did</label>
      <textarea id="cr-summary" rows={6} value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} style={field}
        placeholder="e.g. Patched the cracked plaster along the stairway, primed, and put two coats on the walls and trim." />

      {props.sponsored ? (
        <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>A realtor paid for this job, so &quot;Keep for your records&quot; is left off their copy.</p>
      ) : (
        <>
          <h3 style={h}>Keep for your records</h3>
          <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: "0 0 8px" }}>
            Only lasting things — paint colors, fixtures, materials installed. Nothing is ticked until you tick it.
          </p>
          {props.materialLines.map((line) => (
            <label key={line} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 14 }}>
              <input type="checkbox" checked={hasRecord(line)} onChange={() => toggleLine(line)} />
              {line}
            </label>
          ))}
          {d.records.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input aria-label="What" placeholder="What (e.g. Hall walls)" value={r.label} onChange={(e) => setRecord(i, { label: e.target.value })} style={{ ...field, flex: 1 }} />
              <input aria-label="Detail" placeholder="Detail (e.g. BM White Dove, eggshell)" value={r.detail} onChange={(e) => setRecord(i, { detail: e.target.value })} style={{ ...field, flex: 2 }} />
              <button type="button" aria-label="Remove" className="p7-btn p7-btn-sm" onClick={() => setD({ ...d, records: d.records.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="p7-btn p7-btn-sm" style={{ marginTop: 8 }} onClick={() => setD({ ...d, records: [...d.records, { label: "", detail: "" }] })}>
            + Add an item
          </button>
        </>
      )}

      {msg && <div role={msg.ok ? "status" : "alert"} style={{ marginTop: 14, color: msg.ok ? "var(--fg-success, #065f46)" : "var(--fg-danger, #991b1b)" }}>{msg.text}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 18, position: "sticky", bottom: 12 }}>
        <button type="button" className="p7-btn p7-btn-primary" disabled={!!busy || !!props.blockedReason} onClick={() => save("publish")}>
          {busy === "publish" ? "Publishing…" : published ? "Update report" : "Publish"}
        </button>
        {!published && (
          <button type="button" className="p7-btn" disabled={!!busy || !!props.blockedReason} onClick={() => save("save")}>
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
        )}
      </div>
    </div>
  );
}
