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

type BrowserSpeech = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }> }) => void) | null;
  onerror: (() => void) | null;
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

/** Live transcript while MediaRecorder runs. Chrome/Android PWA; no API key. */
export function startBrowserSpeech(onUpdate: (text: string) => void): () => Promise<string> {
  const Ctor = speechCtor();
  if (!Ctor) return async () => "";

  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  let latest = "";
  rec.onresult = (event) => {
    latest = transcriptFromSpeechResults(event.results);
    onUpdate(latest);
  };
  rec.onerror = () => {
    /* keep whatever we have; original audio still saves */
  };
  try {
    rec.start();
  } catch {
    return async () => latest;
  }

  return () =>
    new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(latest);
      };
      rec.onend = finish;
      try {
        rec.stop();
      } catch {
        finish();
        return;
      }
      setTimeout(finish, 500);
    });
}
