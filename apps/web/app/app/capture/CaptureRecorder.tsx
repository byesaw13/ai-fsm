"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  listPending,
  removePending,
  savePending,
  type PendingCapture,
} from "./pending-queue";
import { browserSpeechAvailable, startBrowserSpeech } from "./speech-transcript";

type MicState = "starting" | "ready" | "denied" | "unsupported";
type RecordState = "idle" | "recording" | "saving";

const HOLD_MS = 450;
const LOGIN_NEXT = "/login?next=/app/capture";

function savedStatus(spoken: string): string {
  if (spoken) {
    return spoken.length <= 80 ? `Saved: ${spoken}` : `Saved: ${spoken.slice(0, 77)}…`;
  }
  if (browserSpeechAvailable()) {
    return "Saved, but no words were heard. Try again closer to the phone.";
  }
  return "Saved. Use Chrome so the words extract.";
}

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionForMime(mime: string): string {
  const base = mime.split(";")[0];
  if (base.includes("mp4")) return "m4a";
  if (base.includes("ogg")) return "ogg";
  return "webm";
}

async function postCapture(item: PendingCapture): Promise<"ok" | "auth" | "fail"> {
  const form = new FormData();
  form.append("client_id", item.id);
  form.append("audio", item.audio, item.audioName);
  if (item.photo) form.append("photo", item.photo, item.photoName || "photo.jpg");
  const spoken = item.transcript?.trim();
  if (spoken) form.append("transcript", spoken);
  try {
    const res = await fetch("/api/v1/captures", { method: "POST", body: form });
    if (res.status === 401) return "auth";
    if (!res.ok) return "fail";
    return "ok";
  } catch {
    return "fail";
  }
}

export function CaptureRecorder() {
  const [mic, setMic] = useState<MicState>("starting");
  const [record, setRecord] = useState<RecordState>("idle");
  const [status, setStatus] = useState("Starting microphone…");
  const [photo, setPhoto] = useState<File | null>(null);
  const [failedCount, setFailedCount] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef("");
  const downAtRef = useRef(0);
  const tapStopRef = useRef(false);
  const activeRef = useRef(false);
  const recordRef = useRef<RecordState>("idle");
  const photoRef = useRef<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const stopSpeechRef = useRef<(() => Promise<string>) | null>(null);

  function setRecordState(next: RecordState) {
    recordRef.current = next;
    setRecord(next);
  }

  useEffect(() => {
    photoRef.current = photo;
  }, [photo]);

  const flushPending = useCallback(async () => {
    const pending = await listPending();
    if (pending.length === 0) {
      setFailedCount(0);
      return;
    }
    setStatus(`Saving ${pending.length} capture${pending.length === 1 ? "" : "s"}…`);
    let remaining = 0;
    for (const item of pending) {
      const result = await postCapture(item);
      if (result === "ok") {
        await removePending(item.id);
      } else if (result === "auth") {
        remaining += 1;
        window.location.replace(LOGIN_NEXT);
        return;
      } else {
        remaining += 1;
      }
    }
    setFailedCount(remaining);
    if (remaining > 0) {
      setStatus("Couldn't save. Tap retry — the recording is still on this phone.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function startMic() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setMic("unsupported");
        setStatus("This browser cannot record audio.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        mimeRef.current = pickRecorderMime();
        setMic("ready");
        setStatus(
          browserSpeechAvailable()
            ? "Tap or hold to record"
            : "Tap or hold to record. Use Chrome so the words extract.",
        );
        void flushPending();
      } catch {
        if (!cancelled) {
          setMic("denied");
          setStatus("Microphone is blocked. Allow the mic and reopen Capture.");
        }
      }
    }
    void startMic();
    return () => {
      cancelled = true;
      recorderRef.current?.stop();
      void stopSpeechRef.current?.();
      stopSpeechRef.current = null;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    };
  }, [flushPending]);

  const stopAndSave = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setRecordState("saving");
    setStatus("Saving…");
    recorder.stop();
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || mic !== "ready" || recordRef.current !== "idle" || activeRef.current) return;
    if (typeof MediaRecorder === "undefined") {
      setMic("unsupported");
      setStatus("This browser cannot record audio.");
      return;
    }
    chunksRef.current = [];
    const mime = mimeRef.current;
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      activeRef.current = false;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || "audio/webm" });
      chunksRef.current = [];
      recorderRef.current = null;
      const stopSpeech = stopSpeechRef.current;
      stopSpeechRef.current = null;
      const spoken = (stopSpeech ? await stopSpeech() : "").trim();
      if (blob.size === 0) {
        setRecordState("idle");
        setStatus(
          browserSpeechAvailable()
            ? "Tap or hold to record"
            : "Tap or hold to record. Use Chrome so the words extract.",
        );
        return;
      }
      const item: PendingCapture = {
        id: crypto.randomUUID(),
        audio: blob,
        audioName: `capture.${extensionForMime(blob.type)}`,
        photo: photoRef.current ?? undefined,
        photoName: photoRef.current?.name,
        transcript: spoken || undefined,
      };
      await savePending(item);
      const result = await postCapture(item);
      if (result === "ok") {
        await removePending(item.id);
        setPhoto(null);
        setRecordState("idle");
        setStatus(savedStatus(spoken));
        void flushPending();
        return;
      }
      if (result === "auth") {
        setRecordState("idle");
        window.location.replace(LOGIN_NEXT);
        return;
      }
      setFailedCount((count) => count + 1);
      setRecordState("idle");
      setStatus("Couldn't save. Tap retry — the recording is still on this phone.");
    };
    try {
      activeRef.current = true;
      setRecordState("recording");
      setStatus("Recording… tap or release to save");
      stopSpeechRef.current = startBrowserSpeech((text) => {
        if (recordRef.current !== "recording") return;
        setStatus(text ? `Recording… ${text}` : "Recording… tap or release to save");
      });
      recorder.start(250);
    } catch {
      activeRef.current = false;
      recorderRef.current = null;
      void stopSpeechRef.current?.();
      stopSpeechRef.current = null;
      setRecordState("idle");
      setStatus("Could not start recording.");
    }
  }, [flushPending, mic]);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (mic !== "ready") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (recordRef.current === "recording") {
      tapStopRef.current = true;
      return;
    }
    if (recordRef.current !== "idle") return;
    downAtRef.current = Date.now();
    tapStopRef.current = false;
    startRecording();
  }

  function onPointerUp() {
    if (recordRef.current !== "recording") return;
    const held = Date.now() - downAtRef.current >= HOLD_MS;
    if (tapStopRef.current || held) {
      tapStopRef.current = false;
      stopAndSave();
    }
  }

  const canRecord = mic === "ready" && record !== "saving";
  const busy = record === "saving";

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 600,
        background: "var(--bg)",
        color: "var(--fg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-6)",
        padding: "var(--space-6)",
        paddingBottom: "calc(var(--space-8) + env(safe-area-inset-bottom, 0px))",
        fontFamily: "var(--font-sans)",
      }}
    >
      <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
        Capture
      </h1>
      <p
        role="status"
        aria-live="polite"
        style={{
          margin: 0,
          color: "var(--fg-secondary)",
          fontSize: "var(--text-base)",
          textAlign: "center",
          minHeight: "1.5em",
        }}
      >
        {status}
      </p>

      <button
        type="button"
        disabled={!canRecord}
        aria-pressed={record === "recording"}
        aria-label={record === "recording" ? "Stop and save" : "Record"}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
        style={{
          width: 168,
          height: 168,
          borderRadius: "50%",
          border: "none",
          background: record === "recording" ? "var(--color-danger)" : "var(--accent)",
          color: "var(--accent-fg)",
          fontSize: "var(--text-lg)",
          fontWeight: 700,
          boxShadow: "var(--shadow-md, 0 8px 24px rgba(0,0,0,0.18))",
          cursor: canRecord ? "pointer" : "default",
          opacity: canRecord ? 1 : 0.55,
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        {record === "recording" ? "Stop" : busy ? "Saving" : "Record"}
      </button>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-3)" }}>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            setPhoto(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="p7-btn p7-btn-secondary"
          disabled={busy}
          onClick={() => photoInputRef.current?.click()}
        >
          {photo ? "Change photo" : "Attach photo (optional)"}
        </button>
        {photo && (
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            {photo.name}
          </p>
        )}
        {failedCount > 0 && (
          <button
            type="button"
            className="p7-btn p7-btn-primary"
            disabled={busy || record === "recording"}
            onClick={() => {
              setRecordState("saving");
              void flushPending().finally(() => setRecordState("idle"));
            }}
          >
            Retry save
          </button>
        )}
      </div>
    </main>
  );
}
