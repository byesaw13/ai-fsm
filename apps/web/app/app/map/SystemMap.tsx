"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { PageContainer, PageHeader } from "@/components/ui";
import {
  BRANCHES,
  EDGES,
  LENS_LIGHTS,
  LENSES,
  STATUS_LABEL,
  type WorkStatus,
} from "./map-data";
import { neighborId, nodeById, workById, workFor } from "./map-logic";
import unlinkedJson from "./unlinked.json";
import "./map.css";

type UnlinkedReport = {
  generatedFrom: string;
  count: number;
  groups: { folder: string; files: string[] }[];
};

const unlinked = unlinkedJson as UnlinkedReport;
const CANVAS_CAP = 4;
const STATUS_RANK: Record<WorkStatus, number> = { asked: 0, idea: 1, progress: 2, backlog: 3, deferred: 4 };

export type MapNote = { id: string; nodeId: string; body: string; createdAt: string };

type Selection =
  | { type: "node"; id: string }
  | { type: "work"; id: string }
  | { type: "edge"; id: number }
  | { type: "lens"; id: string };

const ALWAYS: WorkStatus[] = ["asked", "idea"];

function visibleStatuses(showProgress: boolean, showBacklog: boolean, showDeferred: boolean): WorkStatus[] {
  const statuses = [...ALWAYS];
  if (showProgress) statuses.push("progress");
  if (showBacklog) statuses.push("backlog");
  if (showDeferred) statuses.push("deferred");
  return statuses;
}

export function SystemMap({ notes: initialNotes, notesReady }: { notes: MapNote[]; notesReady: boolean }) {
  const [selected, setSelected] = useState<Selection>({ type: "node", id: "request" });
  const [lens, setLens] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(true);
  const [showBacklog, setShowBacklog] = useState(false);
  const [showDeferred, setShowDeferred] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlinkedOpen, setUnlinkedOpen] = useState(false);
  const statuses = visibleStatuses(showProgress, showBacklog, showDeferred);
  const shownKey = statuses.join("|");

  useEffect(() => {
    const map = document.getElementById("smap-map");
    const wires = document.getElementById("smap-wires");
    const labels = document.getElementById("smap-labels");
    if (!map || !wires || !labels) return;

    function draw() {
      if (!map || !wires || !labels) return;
      const width = map.clientWidth;
      const height = map.scrollHeight;
      for (const layer of [wires, labels]) {
        layer.setAttribute("viewBox", `0 0 ${width} ${height}`);
        layer.style.height = `${height}px`;
      }
      const box = map.getBoundingClientRect();
      const center = (id: string) => {
        const el = map.querySelector<HTMLElement>(`[data-node="${id}"].smap-main`);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 };
      };
      wires.replaceChildren();
      labels.replaceChildren();
      const svg = "http://www.w3.org/2000/svg";
      EDGES.forEach((edge, index) => {
        const from = center(edge.from);
        const to = center(edge.to);
        if (!from || !to) return;
        const on = (selected.type === "edge" && selected.id === index) ||
          (selected.type === "node" && (selected.id === edge.from || selected.id === edge.to)) ||
          (selected.type === "work" && (workById(selected.id)?.branch === edge.from || workById(selected.id)?.branch === edge.to));
        const d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
        const hit = document.createElementNS(svg, "path");
        hit.setAttribute("class", "hit");
        hit.setAttribute("data-edge", String(index));
        hit.setAttribute("d", d);
        const wire = document.createElementNS(svg, "path");
        wire.setAttribute("class", on ? "wire on" : "wire");
        wire.setAttribute("d", d);
        const text = document.createElementNS(svg, "text");
        text.setAttribute("data-edge", String(index));
        text.setAttribute("x", String((from.x + to.x) / 2));
        text.setAttribute("y", String((from.y + to.y) / 2 - 6));
        text.setAttribute("stroke", "#f6f3ee");
        text.setAttribute("stroke-width", "5");
        text.setAttribute("paint-order", "stroke");
        text.textContent = edge.label;
        wires.append(hit, wire);
        labels.append(text);
      });
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(map);
    window.addEventListener("resize", draw);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [selected, shownKey]);

  function chooseNode(id: string) {
    setLens(null);
    setSelected({ type: "node", id });
    setDraft("");
    setError(null);
  }

  const activeNodeId =
    selected.type === "node" ? selected.id :
    selected.type === "work" ? workById(selected.id)?.branch ?? "request" :
    selected.type === "lens" ? selected.id :
    selected.type === "edge" ? EDGES[selected.id]?.from ?? "request" :
    "request";

  async function saveNote() {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/map-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodeId: activeNodeId, body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Could not save that request.");
        return;
      }
      setNotes((current) => [...current, payload.note as MapNote]);
      setDraft("");
    } catch {
      setError("Could not save that request.");
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(id: string) {
    setError(null);
    const response = await fetch(`/api/v1/map-notes/${id}`, { method: "DELETE" });
    if (response.ok) setNotes((current) => current.filter((note) => note.id !== id));
    else setError("Could not remove that request.");
  }

  return (
    <PageContainer>
      <div className="smap-page">
        <PageHeader title="System map" subtitle="Click a bubble or a line. Work from the roadmap sits on the step it belongs to." />
        <p className="smap-lead">Dashed bubbles are in the works, or something you asked for that has no build yet. The full backlog is on the bubble when you click it.</p>
        <div className="smap-tools">
          <span>Show</span>
          <button type="button" className="smap-chip" aria-pressed={showProgress} onClick={() => setShowProgress((value) => !value)}>In the works</button>
          <button type="button" className="smap-chip" aria-pressed={showBacklog} onClick={() => setShowBacklog((value) => !value)}>Backlog</button>
          <button type="button" className="smap-chip" aria-pressed={showDeferred} onClick={() => setShowDeferred((value) => !value)}>Deferred</button>
          <span>Looking from</span>
          {LENSES.map((lensNode) => (
            <button
              key={lensNode.id}
              type="button"
              className="smap-chip"
              aria-pressed={lens === lensNode.id}
              onClick={() => {
                const next = lens === lensNode.id ? null : lensNode.id;
                setLens(next);
                setSelected(next ? { type: "lens", id: next } : { type: "node", id: "request" });
              }}
            >
              {lensNode.label}
              <Count branch={lensNode.id} />
            </button>
          ))}
          <button type="button" className="smap-chip" aria-pressed={selected.type === "node" && selected.id === "floor"} onClick={() => chooseNode("floor")}>
            Under the floor
            <Count branch="floor" />
          </button>
        </div>
        <div className="smap-legend">
          <span><b>Round</b> part of a job</span>
          <span><b>Dashed</b> in the works, or you asked</span>
          <span><b>Dotted</b> backlog, idea, or deferred</span>
        </div>

        <div className="smap-body">
          <div className="smap-stage">
            <div className="smap-map" id="smap-map" onClick={(event) => {
              const node = (event.target as HTMLElement).closest<HTMLElement>("[data-node]");
              const work = (event.target as HTMLElement).closest<HTMLElement>("[data-work]");
              const edge = (event.target as HTMLElement).closest<HTMLElement>("[data-edge]");
              if (work) setSelected({ type: "work", id: work.dataset.work! });
              else if (node) chooseNode(node.dataset.node!);
              else if (edge) setSelected({ type: "edge", id: Number(edge.dataset.edge) });
            }}>
              <svg className="smap-wires" id="smap-wires" />
              <svg className="smap-labels" id="smap-labels" />
              {BRANCHES.map((node) => (
                <div key={node.id} className={`smap-cell${node.id === "request" || node.id === "visit" ? " offpath" : ""}${node.id === "bill" ? " sideright" : ""}`} data-id={node.id}>
                  <button type="button" className={`smap-bubble smap-main${lens && LENS_LIGHTS[lens]?.includes(node.id) ? " lit" : ""}`} data-node={node.id} aria-pressed={selected.type === "node" && selected.id === node.id}>
                    <small>Step {node.step}</small>
                    <b>{node.label}</b>
                  </button>
                  <Satellites branch={node.id} statuses={statuses} selected={selected} lit={lens ? LENS_LIGHTS[lens]?.includes(node.id) : false} />
                </div>
              ))}
            </div>
            {(showProgress || showBacklog || showDeferred) && workFor("floor", statuses).length > 0 && (
              <div className="smap-floor">
                <p className="smap-kicker">Under the floor</p>
                <div className="smap-floor-row">
                  {workFor("floor", statuses).map((item) => (
                    <button key={item.id} type="button" className={`smap-bubble smap-sat ${item.status}`} data-work={item.id} aria-pressed={selected.type === "work" && selected.id === item.id} onClick={() => setSelected({ type: "work", id: item.id })}>
                      <small>{STATUS_LABEL[item.status]}</small>
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Drawer
            selected={selected}
            notes={notes.filter((note) => note.nodeId === activeNodeId)}
            notesReady={notesReady}
            draft={draft}
            saving={saving}
            error={error}
            onDraft={setDraft}
            onSave={saveNote}
            onRemove={removeNote}
            onOpenWork={(id) => setSelected({ type: "work", id })}
            onOpenEdge={(id) => setSelected({ type: "edge", id })}
            onOpenNode={chooseNode}
          />
        </div>

        <section className="smap-unlinked">
          <h2>Seen, not removed</h2>
          <p>
            {unlinked.count === 0
              ? "No unused files showed up on the last scan. A file lands here when nothing imports it and it is not a page or a route."
              : `${unlinked.count} files look unused. They stay until you ask to remove them, after you have seen them here.`}
            {" "}Nothing on this list is deleted just because it is listed.
          </p>
          {unlinked.count > 0 && (
            <button type="button" className="smap-chip" aria-pressed={unlinkedOpen} onClick={() => setUnlinkedOpen((value) => !value)}>
              {unlinkedOpen ? "Hide files" : "Show files"}
            </button>
          )}
          {unlinkedOpen && unlinked.groups.map((group) => (
            <div key={group.folder}>
              <h3>{group.folder}</h3>
              <ul>{group.files.map((file) => <li key={file}>{file}</li>)}</ul>
            </div>
          ))}
        </section>
      </div>
    </PageContainer>
  );
}

function Count({ branch }: { branch: string }) {
  const count = workFor(branch).length;
  if (!count) return null;
  return <small> · {count}</small>;
}

function Satellites({ branch, statuses, selected, lit }: { branch: string; statuses: WorkStatus[]; selected: Selection; lit: boolean }) {
  const items = workFor(branch, statuses).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  if (!items.length) return null;
  const shown = items.slice(0, CANVAS_CAP);
  const rest = items.length - shown.length;
  return (
    <div className="smap-sats">
      {shown.map((item) => (
        <button key={item.id} type="button" className={`smap-bubble smap-sat ${item.status}${lit ? " lit" : ""}`} data-work={item.id} aria-pressed={selected.type === "work" && selected.id === item.id}>
          <small>{STATUS_LABEL[item.status]} · {item.id.startsWith("TASK-") ? item.id : item.phase}</small>
          {item.title}
        </button>
      ))}
      {rest > 0 && (
        <button type="button" className="smap-more" data-node={branch}>
          {rest} more on this step
        </button>
      )}
    </div>
  );
}

function Drawer(props: {
  selected: Selection;
  notes: MapNote[];
  notesReady: boolean;
  draft: string;
  saving: boolean;
  error: string | null;
  onDraft: (value: string) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
  onOpenWork: (id: string) => void;
  onOpenEdge: (id: number) => void;
  onOpenNode: (id: string) => void;
}) {
  const { selected } = props;
  if (selected.type === "lens") {
    const node = nodeById(selected.id);
    if (!node) return null;
    return (
      <aside className="smap-drawer">
        <p className="smap-kicker">Looking from</p>
        <h2>{node.label}</h2>
        <h3>This is</h3>
        <p>{node.intended}</p>
        <h3>What is there</h3>
        <p>{node.built}</p>
        <WorkList branch={node.id} onOpen={props.onOpenWork} />
        <NoteBox {...props} nodeId={node.id} />
      </aside>
    );
  }
  if (selected.type === "edge") {
    const edge = EDGES[selected.id];
    if (!edge) return null;
    return (
      <aside className="smap-drawer">
        <p className="smap-kicker">Line</p>
        <h2>{nodeById(edge.from)?.label} → {nodeById(edge.to)?.label}</h2>
        <h3>{edge.label}</h3>
        <p>{edge.meaning} If this line is wrong, say where it should go. That request stays on the bubble it starts from.</p>
        <NoteBox {...props} nodeId={edge.from} />
      </aside>
    );
  }
  if (selected.type === "work") {
    const item = workById(selected.id);
    const parent = item ? nodeById(item.branch) : undefined;
    if (!item || !parent) return null;
    return (
      <aside className="smap-drawer">
        <p className="smap-kicker">{STATUS_LABEL[item.status]} · {item.phase}{item.id.startsWith("TASK-") ? ` · ${item.id}` : ""}</p>
        <h2>{item.title}</h2>
        <h3>Why it sits here</h3>
        <p>{item.fit}</p>
        <h3>On</h3>
        <p>{parent.label}. {parent.intended}</p>
        <p style={{ marginTop: 8 }}><button type="button" className="smap-chip" onClick={() => props.onOpenNode(parent.id)}>Back to {parent.label}</button></p>
        <NoteBox {...props} nodeId={parent.id} />
      </aside>
    );
  }
  const node = nodeById(selected.id) ?? BRANCHES[0];
  const previous = neighborId(node.id, -1);
  const next = neighborId(node.id, 1);
  return (
    <aside className="smap-drawer">
      <p className="smap-kicker">{node.step ? `Step ${node.step} of 8` : node.kind === "floor" ? "Plumbing" : "Looking from"}</p>
      <h2>{node.label}</h2>
      <h3>This is</h3>
      <p>{node.intended}</p>
      <h3>What is there</h3>
      <p>{node.built}</p>
      {node.kind === "branch" && (
        <>
          <h3>Lines</h3>
          <div className="smap-links">
            {EDGES.map((edge, index) => edge.from === node.id || edge.to === node.id ? (
              <button key={edge.from + edge.to} type="button" onClick={() => props.onOpenEdge(index)}>
                {edge.label} {nodeById(edge.from === node.id ? edge.to : edge.from)?.label}
              </button>
            ) : null)}
          </div>
        </>
      )}
      <WorkList branch={node.id} onOpen={props.onOpenWork} />
      {node.records.length > 0 && (
        <>
          <h3>Records</h3>
          <table className="smap-records">
            <tbody>
              {node.records.map((record) => (
                <tr key={record.name}><th>{record.name}</th><td>{record.holds}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p style={{ marginTop: 12 }}>
        <Link href={node.screenHref as Route}>{node.screenLabel}</Link>
      </p>
      {node.kind === "branch" && (
        <p style={{ marginTop: 8 }}>
          <button type="button" className="smap-chip" disabled={previous === node.id} onClick={() => props.onOpenNode(previous)}>Previous</button>{" "}
          <button type="button" className="smap-chip" disabled={next === node.id} onClick={() => props.onOpenNode(next)}>Next</button>
        </p>
      )}
      <NoteBox {...props} nodeId={node.id} />
    </aside>
  );
}

function WorkList({ branch, onOpen }: { branch: string; onOpen: (id: string) => void }) {
  const items = workFor(branch);
  if (!items.length) return null;
  const order: WorkStatus[] = ["progress", "asked", "backlog", "idea", "deferred"];
  return (
    <>
      <h3>On this bubble</h3>
      <div className="smap-links">
        {order.map((status) => {
          const group = items.filter((item) => item.status === status);
          if (!group.length) return null;
          return (
            <div key={status}>
              <p className="smap-meta">{STATUS_LABEL[status]}</p>
              {group.map((item) => (
                <button key={item.id} type="button" onClick={() => onOpen(item.id)}>
                  <span className="smap-meta">{item.phase}{item.id.startsWith("TASK-") ? ` · ${item.id}` : ""}</span>
                  {item.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

function NoteBox({ nodeId, notes, notesReady, draft, saving, error, onDraft, onSave, onRemove }: {
  nodeId: string;
  notes: MapNote[];
  notesReady: boolean;
  draft: string;
  saving: boolean;
  error: string | null;
  onDraft: (value: string) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <h3>Requests on this bubble</h3>
      {notes.map((note) => (
        <div key={note.id} className="smap-note">
          {note.body}
          <br />
          <button type="button" onClick={() => onRemove(note.id)}>Remove</button>
        </div>
      ))}
      {!notesReady && <p className="smap-error">Requests save after the map notes table is migrated. The picture above is already complete.</p>}
      <form className="smap-note-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <textarea value={draft} maxLength={500} placeholder={`What should change on ${nodeById(nodeId)?.label ?? "this"}?`} onChange={(event) => onDraft(event.target.value)} />
        <button className="smap-save" type="submit" disabled={saving || !draft.trim() || !notesReady}>Save request</button>
        {error && <p className="smap-error">{error}</p>}
      </form>
    </>
  );
}

