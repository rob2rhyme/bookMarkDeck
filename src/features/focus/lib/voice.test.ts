import { describe, expect, it } from "vitest";

import { chooseVoice, pauseAfter, rankVoices, scoreVoice, splitSentences } from "@/features/focus/lib/voice";

const v = (name: string, lang = "en-US") => ({ name, lang });

describe("scoreVoice", () => {
  it("puts neural and enhanced voices above the classic desktop ones", () => {
    const neural = scoreVoice(v("Microsoft Aria Online (Natural) - English (United States)"));
    const apple = scoreVoice(v("Samantha (Enhanced)"));
    const google = scoreVoice(v("Google US English"));
    const old = scoreVoice(v("Microsoft David Desktop - English (United States)"));
    const espeak = scoreVoice(v("eSpeak English"));
    expect(neural).toBeGreaterThan(google);
    expect(apple).toBeGreaterThan(google);
    expect(google).toBeGreaterThan(old);
    expect(old).toBeGreaterThan(espeak);
  });

  it("buries novelty voices and compact variants", () => {
    expect(scoreVoice(v("Zarvox"))).toBeLessThan(-50);
    expect(scoreVoice(v("Samantha (Compact)"))).toBeLessThan(scoreVoice(v("Samantha")));
  });
});

describe("rankVoices / chooseVoice", () => {
  const voices = [
    v("eSpeak English"),
    v("Microsoft David Desktop"),
    v("Google US English"),
    v("Microsoft Aria Online (Natural)"),
    v("Amélie", "fr-FR"),
  ];

  it("lists English voices best first, leaving other languages out", () => {
    expect(rankVoices(voices).map((x) => x.name)).toEqual([
      "Microsoft Aria Online (Natural)",
      "Google US English",
      "Microsoft David Desktop",
      "eSpeak English",
    ]);
  });

  it("falls back to every voice when the device has no English one", () => {
    expect(rankVoices([v("Amélie", "fr-FR")])).toHaveLength(1);
  });

  it("uses the saved choice while it is installed, the best voice otherwise", () => {
    expect(chooseVoice(voices, "Google US English")!.name).toBe("Google US English");
    // Saved on another device and not here: quietly use the best.
    expect(chooseVoice(voices, "Alex")!.name).toBe("Microsoft Aria Online (Natural)");
    expect(chooseVoice(voices, null)!.name).toBe("Microsoft Aria Online (Natural)");
    expect(chooseVoice([], null)).toBeNull();
  });
});

describe("splitSentences / pauseAfter", () => {
  it("splits a guide step into sentences and keeps the punctuation", () => {
    expect(splitSentences("Close your eyes. Notice your breath… Let it slow!  Good.")).toEqual([
      "Close your eyes.",
      "Notice your breath…",
      "Let it slow!",
      "Good.",
    ]);
  });

  it("leaves a single cue whole and ignores blank text", () => {
    expect(splitSentences("Breathe in")).toEqual(["Breathe in"]);
    expect(splitSentences("   ")).toEqual([]);
  });

  it("pauses longer after a full stop than after a trailing clause", () => {
    expect(pauseAfter("Close your eyes.")).toBeGreaterThan(pauseAfter("Close your eyes,"));
  });
});
