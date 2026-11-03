import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  fetchSpeech: vi.fn(),
  playBlob: vi.fn(),
  stopPlayback: vi.fn(),
  prefetchSpeech: vi.fn(),
  probeCloudVoice: vi.fn(),
  unlockPlayback: vi.fn(),
  known: vi.fn(),
}));

vi.mock("@/features/focus/lib/cloudVoice", () => ({
  fetchSpeech: m.fetchSpeech,
  playBlob: m.playBlob,
  stopPlayback: m.stopPlayback,
  prefetchSpeech: m.prefetchSpeech,
  probeCloudVoice: m.probeCloudVoice,
  unlockPlayback: m.unlockPlayback,
  cloudVoiceKnown: m.known,
}));

import { cancelSpeech, prepareNarration, speak, writeVoicePrefs } from "@/features/focus/lib/voice";

let spoken: { text: string; onend?: () => void }[];
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  spoken = [];
  vi.useFakeTimers();
  window.localStorage.clear();
  Object.values(m).forEach((f) => f.mockReset());
  m.known.mockReturnValue(undefined);
  m.fetchSpeech.mockResolvedValue({ size: 3 });
  m.playBlob.mockResolvedValue(true);
  m.probeCloudVoice.mockResolvedValue(true);
  m.prefetchSpeech.mockResolvedValue(undefined);
  class FakeUtterance {
    rate = 1;
    pitch = 1;
    lang = "";
    onend?: () => void;
    constructor(public text: string) {}
  }
  (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
  (window as unknown as Record<string, unknown>).speechSynthesis = {
    getVoices: () => [],
    speak: (u: { text: string; onend?: () => void }) => spoken.push(u),
    cancel: () => {},
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

describe("speak with the natural voice", () => {
  it("uses the device voice unless the cloud engine is chosen", async () => {
    speak("Close your eyes.");
    await flush();
    expect(m.fetchSpeech).not.toHaveBeenCalled();
    expect(spoken.map((u) => u.text)).toEqual(["Close your eyes."]);
  });

  it("fetches and plays each sentence in order, pausing between", async () => {
    writeVoicePrefs({ engine: "cloud", cloudVoice: "sage", pace: "slow" });
    speak("Close your eyes. Notice your breath.");
    await flush();
    expect(m.fetchSpeech).toHaveBeenCalledTimes(1);
    expect(m.fetchSpeech).toHaveBeenLastCalledWith("Close your eyes.", "sage", 0.8);
    expect(spoken).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(3000);
    await flush();
    expect(m.fetchSpeech).toHaveBeenLastCalledWith("Notice your breath.", "sage", 0.8);
    expect(m.playBlob).toHaveBeenCalledTimes(2);
  });

  it("says a line by the device voice when it can't be fetched", async () => {
    writeVoicePrefs({ engine: "cloud" });
    m.fetchSpeech.mockRejectedValue(new Error("offline"));
    speak("Breathe in.");
    await flush();
    expect(spoken.map((u) => u.text)).toEqual(["Breathe in."]);
  });

  it("says a line by the device voice when it can't be played", async () => {
    writeVoicePrefs({ engine: "cloud" });
    m.playBlob.mockResolvedValue(false);
    speak("Breathe out.");
    await flush();
    expect(spoken.map((u) => u.text)).toEqual(["Breathe out."]);
  });

  it("skips the cloud once the server has said it has no key", async () => {
    writeVoicePrefs({ engine: "cloud" });
    m.known.mockReturnValue(false);
    speak("Hold.");
    await flush();
    expect(m.fetchSpeech).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(1);
  });

  it("a cancel stops playback and drops a line still being fetched", async () => {
    writeVoicePrefs({ engine: "cloud" });
    let release!: (b: unknown) => void;
    m.fetchSpeech.mockReturnValue(new Promise((r) => (release = r)));
    speak("Slowly now.");
    cancelSpeech();
    expect(m.stopPlayback).toHaveBeenCalled();
    release({ size: 3 });
    await flush();
    expect(m.playBlob).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(0);
  });
});

describe("prepareNarration", () => {
  it("does nothing on the device engine", async () => {
    prepareNarration(["Breathe in."]);
    await flush();
    expect(m.unlockPlayback).not.toHaveBeenCalled();
    expect(m.prefetchSpeech).not.toHaveBeenCalled();
  });

  it("unlocks audio and prefetches every sentence on the cloud engine", async () => {
    writeVoicePrefs({ engine: "cloud", cloudVoice: "nova", pace: "natural" });
    prepareNarration(["Breathe in.", "Close your eyes. Relax."]);
    await flush();
    expect(m.unlockPlayback).toHaveBeenCalled();
    expect(m.prefetchSpeech).toHaveBeenCalledWith(
      ["Breathe in.", "Close your eyes.", "Relax."],
      "nova",
      1
    );
  });

  it("fetches nothing when no cloud voice is configured", async () => {
    writeVoicePrefs({ engine: "cloud" });
    m.probeCloudVoice.mockResolvedValue(false);
    prepareNarration(["Breathe in."]);
    await flush();
    expect(m.prefetchSpeech).not.toHaveBeenCalled();
  });
});
