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
 * A continuous, generated backdrop — filtered noise or a soft drone, synthesized
 * with Web Audio (no files). Used behind meditation sessions and, on its own
 * channel, behind a running focus block. One soundscape runs per channel:
 * startAmbient() fades in and replaces that channel's current one, stopAmbient()
 * fades it out. Channels are independent, so starting a meditation never cuts
 * the focus soundscape (or the reverse).
 */

export type AmbientId = "off" | "noise" | "brown" | "rain" | "wind" | "ocean" | "drone";
export type AmbientChannel = "meditation" | "focus";

export const AMBIENT_OPTIONS: { id: AmbientId; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "rain", label: "Rain" },
  { id: "brown", label: "Brown noise" },
  { id: "wind", label: "Wind" },
  { id: "ocean", label: "Ocean" },
  { id: "noise", label: "Soft noise" },
  { id: "drone", label: "Drone" },
];

export function isAmbientId(value: unknown): value is AmbientId {
  return (
    typeof value === "string" &&
    AMBIENT_OPTIONS.some((o) => o.id === value)
  );
}

/** Loudness at the default volume (50). Brown noise is quiet to the ear for its energy, drones loud. */
const PEAK: Record<Exclude<AmbientId, "off">, number> = {
  noise: 0.1,
  brown: 0.16,
  rain: 0.12,
  wind: 0.12,
  ocean: 0.1,
  drone: 0.05,
};

export const DEFAULT_AMBIENT_VOLUME = 50;

/** 10–100 → a gain multiplier where the default (50) is 1×. */
const volumeFactor = (volume: number) =>
  Math.min(100, Math.max(10, volume)) / DEFAULT_AMBIENT_VOLUME;

type Running = { stop: () => void; setVolume: (volume: number) => void };
const ambient: Partial<Record<AmbientChannel, Running>> = {};

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

export function startAmbient(
  id: AmbientId,
  opts: { channel?: AmbientChannel; volume?: number } = {}
) {
  const channel = opts.channel ?? "meditation";
  stopAmbient(channel);
  if (id === "off") return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const peak = PEAK[id];
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, c.currentTime);
  out.gain.exponentialRampToValueAtTime(
    peak * volumeFactor(opts.volume ?? DEFAULT_AMBIENT_VOLUME),
    c.currentTime + 1.5
  );
  out.connect(c.destination);

  const stops: (() => void)[] = [];
  const onStop = (fn: () => void) => stops.push(fn);
  const quiet = (fn: () => void) => () => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  };

  /** A looping noise source through a filter chain into `dest`. */
  const noise = (
    brown: boolean,
    filters: { type: BiquadFilterType; frequency: number; Q?: number }[],
    dest: AudioNode = out,
    level = 1
  ) => {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, brown);
    src.loop = true;
    let node: AudioNode = src;
    const made: BiquadFilterNode[] = [];
    for (const f of filters) {
      const b = c.createBiquadFilter();
      b.type = f.type;
      b.frequency.value = f.frequency;
      if (f.Q !== undefined) b.Q.value = f.Q;
      node.connect(b);
      node = b;
      made.push(b);
    }
    const g = c.createGain();
    g.gain.value = level;
    node.connect(g);
    g.connect(dest);
    src.start();
    onStop(quiet(() => src.stop()));
    return made;
  };

  /** A slow oscillator that moves `param` by ±`depth` — waves, gusts. */
  const sweep = (param: AudioParam, hz: number, depth: number) => {
    const lfo = c.createOscillator();
    lfo.frequency.value = hz;
    const d = c.createGain();
    d.gain.value = depth;
    lfo.connect(d);
    d.connect(param);
    lfo.start();
    onStop(quiet(() => lfo.stop()));
  };

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
      onStop(quiet(() => osc.stop()));
    });
  } else if (id === "ocean") {
    // Slow swell — sweep the cutoff up and down like waves (~10s period).
    const [lp] = noise(true, [{ type: "lowpass", frequency: 500 }]);
    sweep(lp.frequency, 0.1, 250);
  } else if (id === "brown") {
    noise(true, [{ type: "lowpass", frequency: 900 }]);
  } else if (id === "wind") {
    // Band-limited noise whose centre drifts, so it gusts rather than hisses.
    const [bp] = noise(false, [{ type: "bandpass", frequency: 420, Q: 0.7 }], out, 1.6);
    sweep(bp.frequency, 0.07, 260);
  } else if (id === "rain") {
    // A steady hiss, a low roof-rumble, and random droplets on top.
    noise(false, [
      { type: "highpass", frequency: 1200 },
      { type: "lowpass", frequency: 7000 },
    ], out, 0.55);
    noise(true, [{ type: "lowpass", frequency: 350 }], out, 0.5);
    const drops = c.createGain();
    drops.gain.value = 0.9;
    drops.connect(out);
    const dropBuf = noiseBuffer(c, false);
    const timer = window.setInterval(() => {
      const src = c.createBufferSource();
      src.buffer = dropBuf;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800 + Math.random() * 3200;
      bp.Q.value = 6;
      const g = c.createGain();
      const t = c.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25 + Math.random() * 0.4, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(bp);
      bp.connect(g);
      g.connect(drops);
      src.start(t, Math.random());
      src.stop(t + 0.06);
    }, 90);
    onStop(() => window.clearInterval(timer));
  } else {
    // "noise": softly filtered white noise.
    noise(false, [{ type: "lowpass", frequency: 1100 }]);
  }

  ambient[channel] = {
    setVolume: (volume) => {
      try {
        out.gain.cancelScheduledValues(c.currentTime);
        out.gain.setTargetAtTime(peak * volumeFactor(volume), c.currentTime, 0.15);
      } catch {
        /* ignore */
      }
    },
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

export function stopAmbient(channel: AmbientChannel = "meditation") {
  ambient[channel]?.stop();
  delete ambient[channel];
}

/** Change the running soundscape's volume (10–100) without restarting it. */
export function setAmbientVolume(volume: number, channel: AmbientChannel = "meditation") {
  ambient[channel]?.setVolume(volume);
}
