// Synthesizes short chimes with the Web Audio API — no audio files, works
// offline. Browsers suspend the AudioContext until a user gesture, so
// initAudio() must be called from a click/keydown handler (we call it from the
// timer's start button). After that, chimes can fire from timers.

type ChimeType = "session" | "break" | "hydration";

export type SoundId =
  | "classic"
  | "bell"
  | "digital"
  | "gentle"
  | "arcade"
  | "marimba";

export const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "bell", label: "Bell" },
  { id: "digital", label: "Digital" },
  { id: "gentle", label: "Gentle" },
  { id: "arcade", label: "Arcade" },
  { id: "marimba", label: "Marimba" },
];

export function isSoundId(value: unknown): value is SoundId {
  return (
    typeof value === "string" && SOUND_OPTIONS.some((o) => o.id === value)
  );
}

type Profile = {
  wave: OscillatorType;
  notes: number[]; // rising "done" melody; break plays it reversed
  noteLen: number; // seconds
  gap: number; // seconds between note onsets
  gain: number; // peak gain (0..1)
};

const PROFILES: Record<SoundId, Profile> = {
  classic: { wave: "sine", notes: [523.25, 659.25, 783.99], noteLen: 0.18, gap: 0.16, gain: 0.25 },
  bell: { wave: "sine", notes: [987.77, 1318.51], noteLen: 0.55, gap: 0.14, gain: 0.22 },
  digital: { wave: "square", notes: [880, 880], noteLen: 0.08, gap: 0.12, gain: 0.18 },
  gentle: { wave: "sine", notes: [392, 523.25], noteLen: 0.42, gap: 0.22, gain: 0.18 },
  arcade: { wave: "triangle", notes: [523.25, 659.25, 783.99, 1046.5], noteLen: 0.09, gap: 0.08, gain: 0.2 },
  marimba: { wave: "triangle", notes: [659.25, 783.99, 1046.5], noteLen: 0.16, gap: 0.13, gain: 0.24 },
};

// Hydration is intentionally a fixed, light double-tap regardless of profile.
const HYDRATION: Profile = {
  wave: "sine",
  notes: [880, 880],
  noteLen: 0.12,
  gap: 0.14,
  gain: 0.2,
};

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

function playProfile(profile: Profile, notes: number[]) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const now = c.currentTime;
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = profile.wave;
    osc.frequency.value = freq;

    const start = now + i * profile.gap;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(profile.gain, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + profile.noteLen);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + profile.noteLen + 0.02);
  });
}

export function playChime(type: ChimeType = "session", sound: SoundId = "classic") {
  if (type === "hydration") {
    playProfile(HYDRATION, HYDRATION.notes);
    return;
  }
  const profile = PROFILES[sound] ?? PROFILES.classic;
  // Break plays the melody in reverse — a gentle "back to it".
  const notes = type === "break" ? [...profile.notes].reverse() : profile.notes;
  playProfile(profile, notes);
}
