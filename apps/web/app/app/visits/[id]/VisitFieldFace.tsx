"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Modal, useToast } from "@/components/ui";
import {
  fieldPlaceTitle,
  fieldPurpose,
  leaveChecks,
  materialsNeededLine,
  openFieldTasks,
  restOfVisitHeading,
  showLeaveList,
  visitCommand,
  visitFaceStatus,
  type VisitFieldKindName,
} from "@/lib/field/face";
import {
  appendTechNote,
  buildMapsUrl,
  buildTelUrl,
  heroPhotoCategory,
  visitMediaUploadPath,
  visitNotesPath,
} from "@/lib/my-day/visit-hero";
import { buildEstimateUrl } from "./visit-execution-helpers";

export type FaceTask = {
  id: string;
  label: string;
  completed: boolean;
  status: string;
};

import { useFieldDraft } from "@/components/features/field/useFieldDraft";

type Sheet = "add" | "note" | "materials" | "plan" | "partial" | null;

export function VisitFieldFace({
  visitId,
  draftKey,
  noteForm,
  materialsForm,
  planForm,
  completionForm,
  canTransition,
  status,
  clientName,
  address,
  jobTitle,
  clientPhone,
  tasks,
  canToggleTasks,
  photoCount,
  latestMediaId,
  materialsUsed,
  partsRecorded = 0,
  materialsNeeded,
  techNotes,
  hasNextVisit,
  assessmentComplete = false,
  canNotes,
  canCreateEstimate,
  approvedEstimateId,
  clientId,
  jobId,
  propertyId,
  fieldKind,
  noteAnchor,
  materialAnchor,
  usedAnchor,
  children,
}: {
  visitId: string;
  draftKey: string;
  noteForm?: React.ReactNode;
  materialsForm?: React.ReactNode;
  planForm?: React.ReactNode;
  completionForm?: React.ReactNode;
  canTransition: boolean;
  status: string;
  clientName: string | null;
  address: string | null;
  jobTitle: string | null;
  clientPhone: string | null;
  tasks: FaceTask[];
  canToggleTasks: boolean;
  photoCount: number;
  latestMediaId: string | null;
  materialsUsed: string | null;
  partsRecorded?: number;
  materialsNeeded: string | null;
  techNotes: string | null;
  hasNextVisit: boolean;
  assessmentComplete?: boolean;
  canNotes: boolean;
  canCreateEstimate: boolean;
  approvedEstimateId: string | null;
  clientId: string | null;
  jobId: string | null;
  propertyId: string | null;
  fieldKind: VisitFieldKindName;
  noteAnchor: string;
  materialAnchor: string;
  usedAnchor: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const photoRef = useRef<HTMLInputElement>(null);
  const primaryRef = useRef<HTMLDivElement>(null);
  const savedLine = useRef<string | null>(null);
  const inflight = useRef<{ line: string; promise: Promise<boolean> } | null>(null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [primaryOff, setPrimaryOff] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [description, setDescription, clearDescription] = useFieldDraft(`${draftKey}:add-description`, "");
  const [area, setArea, clearArea] = useFieldDraft(`${draftKey}:add-area`, "");
  const [partialTask, setPartialTask] = useState<FaceTask | null>(null);
  const [remainder, setRemainder, clearRemainder] = useFieldDraft(`${draftKey}:partial`, "");
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  function openSheet(next: Sheet) {
    opener.current = document.activeElement as HTMLElement;
    setError("");
    setSheet(next);
  }
  function closeSheet() {
    if (pending) return;
    setSheet(null);
    opener.current?.focus();
  }
  const [localNotes, setLocalNotes] = useState(techNotes ?? "");

  useEffect(() => {
    setLocalNotes(techNotes ?? "");
  }, [techNotes]);

  const open = openFieldTasks(tasks);
  const first = open[0] ?? null;
  const rest = open.slice(1);
  const command = visitCommand({
    status,
    fieldKind,
    hasOpenTask: !!first,
    hasAddress: !!address?.trim(),
    assessmentComplete,
  });
  const place = fieldPlaceTitle(clientName, address);
  const purpose = fieldPurpose(jobTitle);
  const needed = materialsNeededLine(materialsNeeded);
  const mapsUrl = buildMapsUrl(address);
  const telUrl = buildTelUrl(clientPhone);
  const onSite = showLeaveList(status);
  const checks = leaveChecks({
    photoCount,
    materialsUsed,
    partsRecorded,
    techNotes: localNotes,
    hasNextVisit,
  });
  const showTasks = status !== "completed" && status !== "cancelled" && (fieldKind === "standard" || fieldKind === "repair");

  useEffect(() => {
    const el = primaryRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPrimaryOff(!entry.isIntersecting),
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [command.kind, first?.id]);

  const hasNoteForm = !!noteForm;
  const hasMaterialsForm = !!materialsForm;
  const hasPlanForm = !!planForm;
  const hasCompletionForm = !!completionForm;
  useEffect(() => {
    function followAnchor(anchor: string) {
      let targetSheet: Sheet = null;
      if (hasNoteForm && ["visit-notes", "visit-resolution"].includes(anchor)) targetSheet = "note";
      if (hasMaterialsForm && ["visit-parts", "need-material", "visit-materials"].includes(anchor)) targetSheet = "materials";
      if (hasPlanForm && anchor === "visit-day-tasks") targetSheet = "plan";
      if (targetSheet) {
        opener.current = document.activeElement as HTMLElement;
        setError("");
        setSheet(targetSheet);
      } else if (hasCompletionForm && anchor === "visit-completion") {
        setFinishing(true);
        window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" }), 50);
      } else if (anchor) {
        const record = document.getElementById("visit-record");
        if (record instanceof HTMLDetailsElement && record.querySelector(`[id="${CSS.escape(anchor)}"]`)) record.open = true;
      }
    }
    function onHashChange() { followAnchor(window.location.hash.slice(1)); }
    function onAnchorClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return;
      // Next Link uses pushState for hashes; preserve links to moved field tools.
      const anchor = url.hash.slice(1);
      if (!["visit-notes", "visit-resolution", "visit-parts", "need-material", "visit-materials", "visit-day-tasks", "visit-completion"].includes(anchor)) return;
      event.preventDefault();
      if (window.location.hash === url.hash) followAnchor(anchor);
      else window.location.hash = url.hash;
    }
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onAnchorClick, true);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onAnchorClick, true);
    };
  }, [visitId, hasNoteForm, hasMaterialsForm, hasPlanForm, hasCompletionForm]);

  function openRecord(anchorId: string) {
    const record = document.getElementById("visit-record");
    if (record instanceof HTMLDetailsElement) record.open = true;
    window.setTimeout(() => {
      const target = document.getElementById(anchorId)
        ?? (anchorId === "visit-actions" ? document.getElementById("visit-completion") : null);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function postTransition(nextStatus: string) {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error?.message ?? "Could not update the visit. Retry below.");
        return;
      }
      toast.success("Visit started");
      router.refresh();
    } catch {
      setError("Could not save. Your draft is kept; retry.");
    } finally {
      setPending(false);
    }
  }

  async function markDone(taskId: string) {
    if (!canToggleTasks) return;
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "done", task_id: taskId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error?.message ?? "Could not mark done. Retry below.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not save. Your draft is kept; retry.");
    } finally {
      setPending(false);
    }
  }

  async function markPartial(task: FaceTask) {
    if (!canToggleTasks) return;
    if (!remainder.trim()) {
      setError("Describe what is left to do, or cancel.");
      return;
    }
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "partial",
          task_id: task.id,
          remainder_label: remainder.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error?.message ?? "Could not save partial progress. Retry below.");
        return;
      }
      clearRemainder();
      setRemainder("");
      clearRemainder();
      setSheet(null);
      opener.current?.focus();
      router.refresh();
    } catch {
      setError("Could not save. Your draft is kept; retry.");
    } finally {
      setPending(false);
    }
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", heroPhotoCategory(status));
      const res = await fetch(visitMediaUploadPath(visitId), { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error?.message ?? "Upload failed. Select the photo again to retry.");
        return;
      }
      toast.success("Photo saved on this visit");
      router.refresh();
    } catch {
      setError("Upload failed. Select the photo again to retry.");
    } finally {
      setUploading(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  }

  async function saveAddedWork(): Promise<boolean> {
    const text = description.trim();
    if (!text) {
      toast.error("Describe the work first");
      return false;
    }
    if (!canNotes) {
      toast.error("You can’t add a note on this visit");
      return false;
    }
    const line = `Added work${area.trim() ? ` (${area.trim()})` : ""}: ${text}`;
    if (savedLine.current === line) return true;
    if (inflight.current?.line === line) return inflight.current.promise;

    setPending(true);
    setError("");
    const promise = (async () => {
      const currentRes = await fetch(visitNotesPath(visitId));
      const currentBody = await currentRes.json().catch(() => ({}));
      if (!currentRes.ok) {
        setError(currentBody.error?.message ?? "Could not read the current note. Retry.");
        return false;
      }
      const current = typeof currentBody?.data?.tech_notes === "string"
        ? currentBody.data.tech_notes
        : "";
      const next = appendTechNote(current, line);
      const res = await fetch(visitNotesPath(visitId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tech_notes: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error?.message ?? "Could not save the note. Your draft is kept; retry.");
        return false;
      }
      setLocalNotes(next);
      clearDescription(); clearArea();
      toast.success("Saved as a note. It is not billable work yet.");
      router.refresh();
      return true;
    })();

    inflight.current = { line, promise };
    try {
      const ok = await promise;
      if (ok) savedLine.current = line;
      return ok;
    } catch {
      setError("Could not save added work. Your draft is kept; retry.");
      return false;
    } finally {
      setPending(false);
      if (inflight.current?.promise === promise) inflight.current = null;
    }
  }

  async function saveThenGo(href: string) {
    const ok = await saveAddedWork();
    if (ok) window.location.assign(href);
  }

  const estimateHref = buildEstimateUrl({
    clientId,
    jobId,
    propertyId,
    visitId,
  });

  function finishVisit() {
    if (!completionForm) { openRecord("visit-actions"); return; }
    setFinishing(true);
    window.setTimeout(() => document.getElementById("visit-completion")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  const finishIsNext = command.kind === "none" && status === "in_progress" && canTransition && !!completionForm;
  function renderPrimary() {
    if (command.kind === "assessment") {
      return (
        <Link href={`/app/visits/${visitId}/assessment` as Route} className="p7-field-hero__primary">
          {command.label}
        </Link>
      );
    }
    if (command.kind === "closeout") {
      return (
        <button
          type="button"
          className="p7-field-hero__primary"
          onClick={() => openRecord("visit-actions")}
        >
          {command.label}
        </button>
      );
    }
    if (command.kind === "task" && first) {
      return (
        <button
          type="button"
          className="p7-field-hero__primary"
          disabled={pending || !canToggleTasks}
          onClick={() => void markDone(first.id)}
        >
          {pending ? "…" : command.label}
        </button>
      );
    }
    if (command.kind === "start") {
      return (
        <button
          type="button"
          className="p7-field-hero__primary"
          disabled={pending || !canTransition}
          onClick={() => void postTransition(command.nextStatus)}
        >
          {pending ? "…" : command.label}
        </button>
      );
    }
    if (command.kind === "navigate" && mapsUrl) {
      return (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="p7-field-hero__primary">
          {command.label}
        </a>
      );
    }
    if (finishIsNext) return <button type="button" className="p7-field-hero__primary" onClick={finishVisit}>Finish visit</button>;
    return null;
  }

  const primaryShown = finishIsNext || command.kind !== "none" && !(command.kind === "navigate" && !mapsUrl) && !(command.kind === "task" && !first);

  const photoInput = (
    <input
      ref={photoRef}
      type="file"
      accept="image/*"
      capture="environment"
      data-testid="visit-face-photo-input"
      style={{ display: "none" }}
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void uploadPhoto(file);
      }}
    />
  );

  return (
    <div className="field-visit">
      <div className="field-visit__work">
        <div className="field-visit__top">
          <Link href={"/app/my-work" as Route} className="field-visit__today">Today</Link>
          <p className="field-visit__status" data-testid="visit-status">{visitFaceStatus(status)}</p>
        </div>
        <h1 className="field-visit__place">{place}</h1>
        <p className="field-visit__purpose">{purpose}</p>
        {address && clientName ? <p className="field-visit__where">{clientName}</p> : null}
        {telUrl ? (
          <div className="field-visit__quiet">
            <a href={telUrl} className="field-text-action">Call</a>
          </div>
        ) : null}

        {showTasks && first ? (
          <div className="field-task" data-testid="visit-first-up">
            <p className="field-kicker">Next task</p>
            <p className="field-task__label">{first.label}</p>
            {needed ? <p className="field-command__need">{needed}</p> : null}
            <div className="field-visit__primary" ref={primaryRef}>{renderPrimary()}</div>
            <div className="field-visit__quiet">
              <button type="button" className="field-text-action" disabled={pending || !canToggleTasks || command.kind !== "task"} onClick={() => { setPartialTask(first); openSheet("partial"); }}>
                Started, not finished
              </button>
            </div>
          </div>
        ) : (
          <div className="field-task" ref={primaryRef}>
            {fieldKind === "site_visit" ? <p className="field-kicker">Next task</p> : null}
            {primaryShown ? <div className="field-visit__primary">{renderPrimary()}</div> : null}
          </div>
        )}

        {error && !sheet ? <p role="alert" className="p7-field-error">{error}</p> : null}
        {showTasks && planForm ? <button type="button" className="field-text-action" onClick={() => openSheet("plan")}>Edit today’s plan</button> : null}
        {children}

        {showTasks && rest.length > 0 ? (
          <>
            <p className="field-kicker" style={{ marginTop: "var(--space-6)" }}>{restOfVisitHeading(first?.status)}</p>
            <ul className="field-task__rest">
              {rest.map((task) => (
                <li key={task.id}><span>{task.label}</span>{task.status === "partial" ? <small>Started · not finished</small> : null}{command.kind === "task" ? <button type="button" className="field-text-action" disabled={pending || !canToggleTasks} onClick={() => void markDone(task.id)}>Done</button> : null}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      {onSite ? (
        <section className="field-leave" data-testid="before-you-leave">
          <p className="field-kicker">Before you leave</p>
          {checks.map((check) => {
            if (check.key === "photos") {
              return (
                <button key={check.key} type="button" onClick={() => photoRef.current?.click()}>
                  <span>{check.label}</span>
                  <span className="done">{check.done ? "Recorded" : "Add"}</span>
                </button>
              );
            }
            if (check.key === "next") {
              if (!jobId) {
                return (
                  <button key={check.key} type="button" disabled>
                    <span>{check.label}</span>
                    <span className="done">{check.done ? "Done" : "Not scheduled"}</span>
                  </button>
                );
              }
              return (
                <Link key={check.key} href={`/app/jobs/${jobId}` as Route}>
                  <span>{check.label}</span>
                  <span className="done">{check.done ? "Done" : "Schedule"}</span>
                </Link>
              );
            }
            const anchor = check.key === "materials" ? usedAnchor : check.key === "note" ? noteAnchor : materialAnchor;
            return (
              <button key={check.key} type="button" onClick={() => { if (check.key === "materials" && materialsForm) openSheet("materials"); else if (check.key === "note" && noteForm) openSheet("note"); else openRecord(anchor); }}>
                <span>{check.label}</span>
                <span className="done">{check.done ? "Recorded" : "Add"}</span>
              </button>
            );
          })}
        </section>
      ) : null}

      {status === "in_progress" && canTransition ? <div className="field-finish">
        {!finishIsNext ? <button type="button" className="p7-field-hero__secondary" onClick={finishVisit}>Finish visit</button> : null}
        {finishing ? <section className="field-completion">{completionForm}</section> : null}
      </div> : null}
      <details className="field-recorded">
        <summary>Recorded today · {tasks.filter(t => t.completed || t.status === "done").length} tasks done · {photoCount} completion photos</summary>
        <ul>{tasks.filter(t => t.completed || t.status === "done").map(t => <li key={t.id}>{t.label} · Done (locked)</li>)}</ul>
        <p style={{ whiteSpace: "pre-wrap" }}>{localNotes || "No visit notes recorded."}</p>
      </details>

      {status !== "completed" && status !== "cancelled" ? <aside className="field-visit__rail">
        {photoInput}
        {latestMediaId ? (
          <Image
            className="field-rail-photo"
            alt=""
            width={320}
            height={160}
            unoptimized
            src={`/api/v1/visits/${visitId}/media/${latestMediaId}/image`}
          />
        ) : null}
        {needed ? <p className="field-rail-note">{needed}</p> : null}
        <div className={`field-dock-primary${primaryOff && primaryShown ? " is-on" : ""}`}>{primaryOff ? renderPrimary() : null}</div>
        <div className="field-actions">
          <button type="button" disabled={uploading} onClick={() => photoRef.current?.click()}>
            {uploading ? "…" : "Photo"}
          </button>
          <button type="button" disabled={!canNotes} onClick={() => noteForm ? openSheet("note") : openRecord(noteAnchor)}>Note</button>
          <button type="button" disabled={!canNotes} onClick={() => materialsForm ? openSheet("materials") : openRecord(materialAnchor)}>Materials</button>
          <button type="button" disabled={!canNotes} onClick={() => openSheet("add")}>Add work</button>
        </div>
      </aside> : null}

      <Modal open={sheet !== null} onClose={closeSheet} title={sheet === "add" ? "Add work" : sheet === "partial" ? "Started, not finished" : sheet === "plan" ? "Today’s plan" : sheet === "materials" ? "Materials" : "Visit notes"} data-testid="visit-tool-sheet">
        {error ? <p role="alert" className="p7-field-error">{error}</p> : null}
        {sheet === "note" ? noteForm : null}
        {sheet === "materials" ? materialsForm : null}
        {sheet === "plan" ? planForm : null}
        {sheet === "partial" && partialTask ? <form onSubmit={e => { e.preventDefault(); void markPartial(partialTask); }} className="field-sheet__panel">
          <p>{partialTask.label}</p>
          <label>What is left to do?<textarea value={remainder} onChange={e => setRemainder(e.target.value)} required maxLength={500} /></label>
          <p>This records partial progress and creates a follow-up task.</p>
          <button type="submit" className="p7-field-hero__primary" disabled={pending || !remainder.trim()}>Save partial progress</button>
        </form> : null}
        {sheet === "add" ? <div className="field-sheet__panel">
            <p className="field-visit__where">
              This stays a note until someone prices it. It does not change the estimate.
            </p>
            <label>
              Photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                }}
              />
            </label>
            <label>
              What did you find?
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </label>
            <label>
              Area
              <input type="text" value={area} onChange={(event) => setArea(event.target.value)} placeholder="Optional" />
            </label>
            {description.trim() ? (
              <div className="field-sheet__choices">
                <button type="button" className="p7-field-hero__secondary" disabled={pending || !canNotes} onClick={() => void saveAddedWork()}>
                  Save as a note
                </button>
                {canCreateEstimate && approvedEstimateId ? (
                  <button type="button" className="field-text-action" disabled={pending} onClick={() => void saveThenGo(`/app/estimates/${approvedEstimateId}#change-orders`)}>
                    Change order
                  </button>
                ) : null}
                {canCreateEstimate && estimateHref ? (
                  <button type="button" className="field-text-action" disabled={pending} onClick={() => void saveThenGo(estimateHref)}>
                    Separate estimate
                  </button>
                ) : null}
                {canCreateEstimate ? (
                  <button type="button" className="field-text-action" disabled={pending} onClick={() => void saveThenGo("/app/intake/new")}>
                    Future request
                  </button>
                ) : null}
                {!canCreateEstimate ? (
                  <p>The office can turn this into a change order, an estimate, or a request.</p>
                ) : null}
              </div>
            ) : null}
          </div> : null}
      </Modal>
    </div>
  );
}
