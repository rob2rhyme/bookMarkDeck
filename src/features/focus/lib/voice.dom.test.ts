import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cancelSpeech, readVoicePrefs, speak, writeVoicePrefs } from "@/features/focus/lib/voice";

// A fake speechSynthesis that records utterances and lets a test "finish" them,
// since the browser's own never runs here. What it can show: guide text is spoken
// a sentence at a time with a pause between, the chosen voice and pace are used,
// and a new line or a cancel stops the old chain instead of talking over it.
type Utter = { text: string; rate: number; pitch: number; voice?: { name: string }; onend?: () => void };

let spoken: Utter[];
let cancelCount: number;
const VOICES = [
  { name: "Google US English", lang: "en-US" },
  { name: "Microsoft Aria Online (Natural)", lang: "en-US" },
];

beforeEach(() => {
  spoken = [];
  cancelCount = 0;
  vi.useFakeTimers();
  window.localStorage.clear();
  class FakeUtterance {
    rate = 1;
    pitch = 1;
    lang = "";
    voice?: { name: string };
    onend?: () => void;
    constructor(public text: string) {}
  }
  (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
  (window as unknown as Record<string, unknown>).speechSynthesis = {
    getVoices: () => VOICES,
    speak: (u: Utter) => spoken.push(u),
    cancel: () => {
      cancelCount++;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
});

afterEach(() => {
  cancelSpeech();
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
});

const finish = (i: number) => spoken[i].onend?.();

describe("speak", () => {
  it("says a multi-sentence step one sentence at a time, with a pause between", () => {
    speak("Close your eyes. Notice your breath.");
    expect(spoken.map((u) => u.text)).toEqual(["Close your eyes."]);

    finish(0);
    // Not straight away: there is a breath between sentences.
    expect(spoken).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(spoken.map((u) => u.text)).toEqual(["Close your eyes.", "Notice your breath."]);
  });

  it("uses the best voice by default and the listener's choice once saved", () => {
    speak("Breathe in");
    expect(spoken[0].voice!.name).toBe("Microsoft Aria Online (Natural)");

    writeVoicePrefs({ voice: "Google US English" });
    speak("Breathe out");
    expect(spoken[1].voice!.name).toBe("Google US English");
  });

  it("speaks slower at the Slow pace than at Natural", () => {
    writeVoicePrefs({ pace: "slow" });
    speak("Breathe in");
    writeVoicePrefs({ pace: "natural" });
    speak("Breathe in");
    expect(spoken[0].rate).toBeLessThan(spoken[1].rate);
  });

  it("stops the old chain when a new line interrupts it", () => {
    speak("One. Two. Three.");
    finish(0);
    speak("Fresh line.");
    // The pending 'Two.' must never be spoken over the new line.
    vi.advanceTimersByTime(5000);
    expect(spoken.map((u) => u.text)).toEqual(["One.", "Fresh line."]);
    expect(cancelCount).toBeGreaterThan(0);
  });

  it("stops the chain on cancel", () => {
    speak("One. Two.");
    finish(0);
    cancelSpeech();
    vi.advanceTimersByTime(5000);
    expect(spoken.map((u) => u.text)).toEqual(["One."]);
  });

  it("does nothing for blank text, and nothing without speech support", () => {
    speak("   ");
    expect(spoken).toHaveLength(0);
    delete (window as unknown as Record<string, unknown>).speechSynthesis;
    expect(() => speak("Hello")).not.toThrow();
  });
});

describe("voice prefs", () => {
  it("defaults to the best voice at a calm pace, and ignores junk", () => {
    expect(readVoicePrefs()).toEqual({ voice: null, pace: "calm" });
    window.localStorage.setItem("bd:meditation:voice:v1", JSON.stringify({ voice: 3, pace: "frantic" }));
    expect(readVoicePrefs()).toEqual({ voice: null, pace: "calm" });
    window.localStorage.setItem("bd:meditation:voice:v1", "not json");
    expect(readVoicePrefs()).toEqual({ voice: null, pace: "calm" });
  });
});
