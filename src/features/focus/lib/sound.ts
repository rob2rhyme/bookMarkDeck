// Synthesizes short chimes with the Web Audio API — no audio files, works
// offline. Browsers suspend the AudioContext until a user gesture, so
// initAudio() must be called from a click/keydown handler (we call it from the
// timer's start button). After that, chimes can fire from timers.

type ChimeType = "session" | "break" | "hydration";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Call from a user gesture to unlock audio playback. */
export function initAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") {
    c.resume().catch(() => {});
  }
}

const PATTERNS: Record<ChimeType, number[]> = {
  session: [523.25, 659.25, 783.99], // C5 - E5 - G5, rising "done"
  break: [659.25, 523.25], // E5 - C5, gentle "back to it"
  hydration: [880.0, 880.0], // A5 x2, a light double-tap
};

export function playChime(type: ChimeType = "session") {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const now = c.currentTime;
  const notes = PATTERNS[type];
  const noteLen = type === "hydration" ? 0.12 : 0.18;
  const gap = type === "hydration" ? 0.14 : 0.16;

  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    const start = now + i * gap;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + noteLen);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + noteLen + 0.02);
  });
}
