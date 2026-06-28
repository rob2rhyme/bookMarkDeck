// Optional spoken guidance for the Meditation card via the Web Speech API
// (SpeechSynthesis) — the browser's built-in voices, no audio files or network.
// Every export is feature-detected and a safe no-op on the server or where the
// API is missing, mirroring the offline ethos of lib/sound.ts.

export function voiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!voiceSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const pool = en.length ? en : voices;
  // Favour voices that tend to sound calm/natural; otherwise the first English.
  const preferred = pool.find((v) =>
    /(samantha|karen|moira|serena|daniel|natural|google us english)/i.test(
      v.name
    )
  );
  return preferred ?? pool[0] ?? null;
}

/** Nudge the browser to load its voice list (often populated asynchronously). */
export function primeVoices(): void {
  if (!voiceSupported()) return;
  try {
    window.speechSynthesis.getVoices();
  } catch {
    /* ignore */
  }
}

/** Speak text slowly and calmly. Cancels any in-flight utterance by default. */
export function speak(
  text: string,
  opts: { rate?: number; pitch?: number; interrupt?: boolean } = {}
): void {
  if (!voiceSupported() || !text.trim()) return;
  try {
    const synth = window.speechSynthesis;
    if (opts.interrupt !== false) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 0.85;
    u.pitch = opts.pitch ?? 1;
    const v = pickVoice();
    if (v) u.voice = v;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}

export function cancelSpeech(): void {
  if (!voiceSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
