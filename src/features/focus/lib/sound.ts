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

/* ------------------------------------------------------ ambient soundscape ---
 * A continuous, generated backdrop for meditation sessions — filtered noise or
 * a soft drone, synthesized with Web Audio (no files). Only one runs at a time;
 * startAmbient() fades in and replaces any current one, stopAmbient() fades out.
 */

export type AmbientId = "off" | "noise" | "ocean" | "drone";

export const AMBIENT_OPTIONS: { id: AmbientId; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "noise", label: "Soft noise" },
  { id: "ocean", label: "Ocean" },
  { id: "drone", label: "Drone" },
];

export function isAmbientId(value: unknown): value is AmbientId {
  return (
    typeof value === "string" &&
    AMBIENT_OPTIONS.some((o) => o.id === value)
  );
}

let ambient: { stop: () => void } | null = null;

function noiseBuffer(c: AudioContext, brown: boolean): AudioBuffer {
  const len = Math.floor(c.sampleRate * 2); // 2s loop
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  if (brown) {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

export function startAmbient(id: AmbientId) {
  stopAmbient();
  if (id === "off") return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const out = c.createGain();
  const peak = id === "drone" ? 0.05 : 0.1;
  out.gain.setValueAtTime(0.0001, c.currentTime);
  out.gain.exponentialRampToValueAtTime(peak, c.currentTime + 1.5);
  out.connect(c.destination);

  const stops: (() => void)[] = [];

  if (id === "drone") {
    // Two softly detuned sines a fifth apart — a calm, sustained pad.
    [110, 110 * 1.5].forEach((freq, i) => {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = i ? 4 : -4;
      const g = c.createGain();
      g.gain.value = 0.5;
      osc.connect(g);
      g.connect(out);
      osc.start();
      stops.push(() => {
        try {
          osc.stop();
        } catch {
          /* ignore */
        }
      });
    });
  } else {
    const ocean = id === "ocean";
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, ocean);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = ocean ? 500 : 1100;
    src.connect(lp);
    lp.connect(out);
    src.start();
    stops.push(() => {
      try {
        src.stop();
      } catch {
        /* ignore */
      }
    });
    if (ocean) {
      // Slow swell — sweep the cutoff up and down like waves (~10s period).
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.1;
      const depth = c.createGain();
      depth.gain.value = 250;
      lfo.connect(depth);
      depth.connect(lp.frequency);
      lfo.start();
      stops.push(() => {
        try {
          lfo.stop();
        } catch {
          /* ignore */
        }
      });
    }
  }

  ambient = {
    stop: () => {
      try {
        out.gain.cancelScheduledValues(c.currentTime);
        out.gain.setValueAtTime(out.gain.value, c.currentTime);
        out.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.6);
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        stops.forEach((s) => s());
        try {
          out.disconnect();
        } catch {
          /* ignore */
        }
      }, 700);
    },
  };
}

export function stopAmbient() {
  if (ambient) {
    ambient.stop();
    ambient = null;
  }
}
