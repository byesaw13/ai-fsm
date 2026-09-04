/** Join Chrome SpeechRecognition results into one transcript. */
export function transcriptFromSpeechResults(
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }>,
): string {
  const finals: string[] = [];
  let interim = "";
  for (let i = 0; i < results.length; i++) {
    const piece = results[i]?.[0]?.transcript?.trim() ?? "";
    if (!piece) continue;
    if (results[i].isFinal) finals.push(piece);
    else interim = piece;
  }
  return [...finals, interim].filter(Boolean).join(" ").trim();
}

/** Android Chrome will not share the mic between MediaRecorder and SpeechRecognition. */
export function cannotShareMicrophone(
  ua = typeof navigator === "undefined" ? "" : navigator.userAgent,
): boolean {
  return /Android/i.test(ua);
}

export function speechErrorMessage(code: string): string {
  if (code === "audio-capture") return "The mic is busy. Close other apps and try again.";
  if (code === "network") return "Need a data connection for the words to extract.";
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Speech is blocked. Allow the mic and try again.";
  }
  if (code === "no-speech" || code === "aborted") return "";
  return "Could not catch the words.";
}

type BrowserSpeech = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function speechCtor(): (new () => BrowserSpeech) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeech;
    webkitSpeechRecognition?: new () => BrowserSpeech;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function browserSpeechAvailable(): boolean {
  return speechCtor() != null;
}

export type SpeechStop = () => Promise<{ text: string; error: string }>;

/** Live transcript. Do not run beside MediaRecorder on Android. */
export function startBrowserSpeech(onUpdate: (text: string) => void): SpeechStop {
  const Ctor = speechCtor();
  if (!Ctor) return async () => ({ text: "", error: "" });

  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  let latest = "";
  let lastError = "";
  let wantRunning = true;
  rec.onresult = (event) => {
    latest = transcriptFromSpeechResults(event.results);
    onUpdate(latest);
  };
  rec.onerror = (event) => {
    const code = event.error ?? "";
    if (code === "no-speech" || code === "aborted") return;
    lastError = code;
    wantRunning = false;
  };
  rec.onend = () => {
    if (!wantRunning) return;
    try {
      rec.start();
    } catch {
      wantRunning = false;
    }
  };
  try {
    rec.start();
  } catch {
    wantRunning = false;
    return async () => ({ text: latest, error: lastError || "audio-capture" });
  }

  return () =>
    new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve({ text: latest, error: lastError });
      };
      wantRunning = false;
      rec.onend = finish;
      try {
        rec.stop();
      } catch {
        finish();
        return;
      }
      setTimeout(finish, 1500);
    });
}
