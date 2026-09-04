import { describe, expect, it } from "vitest";
import {
  cannotShareMicrophone,
  speechErrorMessage,
  startBrowserSpeech,
  transcriptFromSpeechResults,
} from "../speech-transcript";

describe("transcriptFromSpeechResults", () => {
  it("joins final phrases", () => {
    expect(
      transcriptFromSpeechResults([
        { isFinal: true, 0: { transcript: "I told Mrs. Chen " } },
        { isFinal: true, 0: { transcript: " I would call tomorrow" } },
      ]),
    ).toBe("I told Mrs. Chen I would call tomorrow");
  });

  it("keeps the latest interim when there are no finals yet", () => {
    expect(
      transcriptFromSpeechResults([
        { isFinal: false, 0: { transcript: "I might replace" } },
      ]),
    ).toBe("I might replace");
  });

  it("appends the current interim after finals", () => {
    expect(
      transcriptFromSpeechResults([
        { isFinal: true, 0: { transcript: "I told her" } },
        { isFinal: false, 0: { transcript: " I'd send a price" } },
      ]),
    ).toBe("I told her I'd send a price");
  });
});

describe("cannotShareMicrophone", () => {
  it("is true on Android Chrome, false on desktop Chrome", () => {
    expect(
      cannotShareMicrophone(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe(true);
    expect(
      cannotShareMicrophone(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });
});

describe("speechErrorMessage", () => {
  it("explains a busy mic instead of 'no words'", () => {
    expect(speechErrorMessage("audio-capture")).toMatch(/busy/i);
    expect(speechErrorMessage("network")).toMatch(/data connection/i);
    expect(speechErrorMessage("no-speech")).toBe("");
  });
});

describe("startBrowserSpeech", () => {
  it("is a no-op without a speech engine", async () => {
    const stop = startBrowserSpeech(() => {
      throw new Error("should not update");
    });
    expect(await stop()).toEqual({ text: "", error: "" });
  });
});
