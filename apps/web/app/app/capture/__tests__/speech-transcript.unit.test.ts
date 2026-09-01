import { describe, expect, it } from "vitest";
import { startBrowserSpeech, transcriptFromSpeechResults } from "../speech-transcript";

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

describe("startBrowserSpeech", () => {
  it("is a no-op without a speech engine", async () => {
    const stop = startBrowserSpeech(() => {
      throw new Error("should not update");
    });
    expect(await stop()).toBe("");
  });
});
