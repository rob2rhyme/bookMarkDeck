// The browser side of cloud narration (see /api/tts). A natural-sounding voice for the
// meditation guide, with three jobs beyond "fetch some audio":
//
//   • Never pay twice for a line. Guide wording repeats (a box breath says "Breathe in"
//     every few seconds, every session), so each distinct (text, voice, speed) is
//     generated once and then kept — in memory, and in Cache Storage so the next session
//     and the offline case cost nothing.
//   • Be ready before the cue is due. `fetchSpeech` is called ahead of a session for
//     every line it will say, so a cue never waits on the network mid-sit.
//   • Fail soft. Anything that goes wrong rejects, and voice.ts speaks that line with
//     the device's own voice instead.
//
// All of it is feature-detected and a no-op on the server.

import { type CloudVoiceId } from "@/features/focus/lib/cloudVoiceConfig";

/** Same name as public/sw.js (serviceWorker.test.ts holds the two together). */
export const TTS_CACHE = "bmd-tts-v1";
const PREFIX = "/__tts/";
const MAX_CACHED = 300;
const REQUEST_TIMEOUT_MS = 12_000;

const blobs = new Map<string, Blob>();
const inflight = new Map<string, Promise<Blob>>();

async function cacheKey(text: string, voice: CloudVoiceId, speed: number): Promise<string> {
  const raw = `${voice}|${speed}|${text}`;
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return encodeURIComponent(raw).slice(0, 200); // no SubtleCrypto: the text itself
  }
}

const hasCaches = () => typeof caches !== "undefined";

async function readStored(key: string): Promise<Blob | null> {
  if (!hasCaches()) return null;
  try {
    const cache = await caches.open(TTS_CACHE);
    const hit = await cache.match(PREFIX + key);
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

async function writeStored(key: string, blob: Blob): Promise<void> {
  if (!hasCaches()) return;
  try {
    const cache = await caches.open(TTS_CACHE);
    await cache.put(PREFIX + key, new Response(blob, { headers: { "Content-Type": blob.type || "audio/mpeg" } }));
    // Bounded, oldest first — a changed wording or voice must not pile up forever.
    const keys = await cache.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_CACHED))) await cache.delete(k);
  } catch {
    /* storage full or blocked: it just won't be remembered */
  }
}

/**
 * Audio for one line, from memory, the device cache or the server (in that order).
 * Rejects when the server can't make it — the caller falls back to the device voice.
 */
export function fetchSpeech(text: string, voice: CloudVoiceId, speed: number): Promise<Blob> {
  const run = async (): Promise<Blob> => {
    const key = await cacheKey(text, voice, speed);
    const mem = blobs.get(key);
    if (mem) return mem;
    const stored = await readStored(key);
    if (stored) {
      blobs.set(key, stored);
      return stored;
    }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, speed }),
        signal: ctl.signal,
      });
      if (!res.ok) {
        if (res.status === 503) availability = false; // not configured here: stop asking
        throw new Error(`tts ${res.status}`);
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("tts empty");
      blobs.set(key, blob);
      void writeStored(key, blob);
      return blob;
    } finally {
      clearTimeout(timer);
    }
  };

  // The same line asked for twice at once is one request.
  const id = `${voice}|${speed}|${text}`;
  const existing = inflight.get(id);
  if (existing) return existing;
  const p = run().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

/** Fetch lines ahead of need, a few at a time. Errors are ignored: the cue will retry or fall back. */
export async function prefetchSpeech(
  texts: string[],
  voice: CloudVoiceId,
  speed: number,
  concurrency = 3
): Promise<void> {
  const queue = [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
  const worker = async () => {
    for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
      await fetchSpeech(t, voice, speed).catch(() => {});
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}

/* -------------------------------------------------------------- availability --- */

let availability: boolean | undefined;
let probing: Promise<boolean> | null = null;

/** Whether the server has a narration key. Asked once per page load; undefined until answered. */
export function cloudVoiceKnown(): boolean | undefined {
  return availability;
}

export function probeCloudVoice(): Promise<boolean> {
  if (availability !== undefined) return Promise.resolve(availability);
  if (!probing) {
    probing = fetch("/api/tts")
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d: { configured?: unknown }) => (availability = d.configured === true))
      .catch(() => false) // offline: say no for now, don't remember it
      .finally(() => {
        probing = null;
      });
  }
  return probing;
}

/** Test seam: forget what was learned about this deployment and what was cached in memory. */
export function resetCloudVoice(): void {
  availability = undefined;
  probing = null;
  blobs.clear();
  inflight.clear();
}

/* ------------------------------------------------------------------- playback --- */

// One audio element, reused for every line. iOS only lets an element that was started
// from a tap play later without one, so `unlockPlayback` (called from the Start tap)
// primes this exact element.
let player: HTMLAudioElement | null = null;

const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

function getPlayer(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!player) player = new Audio();
  return player;
}

export function unlockPlayback(): void {
  const a = getPlayer();
  if (!a || a.src) return;
  try {
    a.src = SILENCE;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

// Settles the line now playing, so stopping one can't leave a chain waiting forever.
let settleCurrent: ((finished: boolean) => void) | null = null;

/** Play a blob to its end. Resolves true if it finished, false if it was stopped or failed. */
export function playBlob(blob: Blob): Promise<boolean> {
  const a = getPlayer();
  if (!a) return Promise.resolve(false);
  stopPlayback();
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    let done = false;
    const settle = (ok: boolean) => {
      if (done) return;
      done = true;
      a.onended = a.onerror = null;
      URL.revokeObjectURL(url);
      if (settleCurrent === settle) settleCurrent = null;
      resolve(ok);
    };
    settleCurrent = settle;
    a.onended = () => settle(true);
    a.onerror = () => settle(false);
    a.src = url;
    a.play().catch(() => settle(false));
  });
}

/** Stop whatever is playing; its promise resolves false. */
export function stopPlayback(): void {
  const settle = settleCurrent;
  if (player) {
    try {
      player.pause();
    } catch {
      /* ignore */
    }
  }
  settle?.(false);
}
