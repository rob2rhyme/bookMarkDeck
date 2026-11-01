// Optional spoken guidance for the Meditation card via the Web Speech API
// (SpeechSynthesis) — the browser's built-in voices, no audio files. Every export
// is feature-detected and a safe no-op on the server or where the API is missing,
// mirroring the offline ethos of lib/sound.ts.
//
// What makes it sound less robotic, all within what the browser offers: choose the
// best voice installed (neural/"natural"/enhanced ones are far better than the old
// desktop defaults), let the listener pick one, speak slowly, and say a guide step
// a sentence at a time with a breath between — not as one run-on line. The voice
// is a per-device choice (voices differ by device), kept in localStorage.

export function voiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

/* ------------------------------------------------------------ voice choice --- */

export type VoiceInfo = { name: string; lang: string; score: number };

// Novelty voices macOS ships; never a good meditation guide.
const NOVELTY =
  /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|agnes|princess|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;

/**
 * How good a voice is likely to sound for calm narration. A heuristic over the
 * names browsers expose — neural and "natural" voices first, the classic
 * robotic desktop and eSpeak voices last. Pure.
 */
export function scoreVoice(v: { name: string; lang: string; localService?: boolean }): number {
  const n = v.name;
  let score = 0;
  if (/natural|neural|online/i.test(n)) score += 60; // Edge/Azure neural voices
  if (/premium|enhanced|siri/i.test(n)) score += 50; // Apple's higher-quality downloads
  if (/^google\b/i.test(n)) score += 30; // Chrome's Google voices
  if (/\b(samantha|ava|allison|serena|moira|karen|daniel|tessa|fiona|susan|zoe|nicky|jenny|aria|sonia|libby)\b/i.test(n)) score += 25;
  if (/^en[-_](us|gb|au|ie|za|ca|in)$/i.test(v.lang)) score += 8;
  if (/compact/i.test(n)) score -= 35;
  if (/espeak|festival|flite/i.test(n)) score -= 80;
  if (/microsoft (david|zira|mark|hazel|george|susan|james|catherine|richard|linda)\b/i.test(n) && !/natural|online/i.test(n)) score -= 25;
  if (NOVELTY.test(n)) score -= 100;
  return score;
}

const isEnglish = (v: { lang: string }) => /^en/i.test(v.lang);

/** English voices best-first (all voices if the device has none in English). Pure. */
export function rankVoices<T extends { name: string; lang: string; localService?: boolean }>(
  voices: T[]
): (T & { score: number })[] {
  const en = voices.filter(isEnglish);
  const pool = en.length ? en : voices;
  return pool
    .map((v) => ({ ...v, score: scoreVoice(v) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** The voice to use: the listener's saved choice if it's still installed, else the best. Pure. */
export function chooseVoice<T extends { name: string; lang: string; localService?: boolean }>(
  voices: T[],
  preferred: string | null
): T | null {
  if (preferred) {
    const saved = voices.find((v) => v.name === preferred);
    if (saved) return saved;
  }
  return rankVoices(voices)[0] ?? null;
}

/* ------------------------------------------------------------------ pacing --- */

export type VoicePace = "slow" | "calm" | "natural";

export const VOICE_PACES: { id: VoicePace; label: string; rate: number }[] = [
  { id: "slow", label: "Slow", rate: 0.72 },
  { id: "calm", label: "Calm", rate: 0.85 },
  { id: "natural", label: "Natural", rate: 0.97 },
];

const paceRate = (p: VoicePace) => VOICE_PACES.find((x) => x.id === p)?.rate ?? 0.85;

/** Split narration into sentences so each is spoken on its own, with a pause between. Pure. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** The pause after a sentence, in ms — longer after a full stop than a comma-led line. */
export function pauseAfter(sentence: string): number {
  return /[.!?…]$/.test(sentence) ? 650 : 300;
}

/* ------------------------------------------------------------ device prefs --- */

type Prefs = { voice: string | null; pace: VoicePace };
const PREFS_KEY = "bd:meditation:voice:v1";
const DEFAULT_PREFS: Prefs = { voice: null, pace: "calm" };

export function readVoicePrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null");
    return {
      voice: raw && typeof raw.voice === "string" ? raw.voice : null,
      pace: raw && VOICE_PACES.some((p) => p.id === raw.pace) ? raw.pace : "calm",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeVoicePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...readVoicePrefs(), ...patch };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/* --------------------------------------------------------------- speaking --- */

/** Installed voices, best first, for the picker. [] where speech isn't available. */
export function availableVoices(): VoiceInfo[] {
  if (!voiceSupported()) return [];
  return rankVoices(window.speechSynthesis.getVoices()).map((v) => ({
    name: v.name,
    lang: v.lang,
    score: v.score,
  }));
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

/** Run `cb` whenever the browser finishes (re)loading its voices. Returns the unsubscribe. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!voiceSupported()) return () => {};
  window.speechSynthesis.addEventListener?.("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener?.("voiceschanged", cb);
}

// Bumped by every speak()/cancelSpeech(), so a sentence chain that has been
// replaced or cancelled stops instead of carrying on over the new one.
let generation = 0;
let pauseTimer: number | null = null;

/** A small, repeatable-free wobble so consecutive lines don't sound stamped from one mould. */
const wobble = (amount: number) => 1 + (Math.random() * 2 - 1) * amount;

/**
 * Speak calmly, a sentence at a time with a breath between. Cancels whatever is
 * being said by default. `rate`/`pitch` override the listener's pace for one call.
 */
export function speak(
  text: string,
  opts: { rate?: number; pitch?: number; interrupt?: boolean } = {}
): void {
  if (!voiceSupported() || !text.trim()) return;
  try {
    const synth = window.speechSynthesis;
    const interrupt = opts.interrupt !== false;
    if (interrupt) {
      synth.cancel();
      if (pauseTimer !== null) window.clearTimeout(pauseTimer);
      pauseTimer = null;
      generation++;
    }
    const mine = generation;
    const prefs = readVoicePrefs();
    const voice = chooseVoice(synth.getVoices(), prefs.voice);
    const baseRate = opts.rate ?? paceRate(prefs.pace);
    const basePitch = opts.pitch ?? 0.97; // a touch lower reads as calmer

    const sentences = splitSentences(text);
    const sayFrom = (i: number) => {
      if (mine !== generation || i >= sentences.length) return;
      const u = new SpeechSynthesisUtterance(sentences[i]);
      u.rate = baseRate * wobble(0.03);
      u.pitch = basePitch * wobble(0.02);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.onend = () => {
        if (mine !== generation || i + 1 >= sentences.length) return;
        pauseTimer = window.setTimeout(() => sayFrom(i + 1), pauseAfter(sentences[i]));
      };
      synth.speak(u);
    };
    sayFrom(0);
  } catch {
    /* ignore */
  }
}

export function cancelSpeech(): void {
  if (!voiceSupported()) return;
  try {
    generation++;
    if (pauseTimer !== null) window.clearTimeout(pauseTimer);
    pauseTimer = null;
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
