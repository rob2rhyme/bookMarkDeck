"use client";

import { useEffect, useState } from "react";

import {
  availableVoices,
  onVoicesChanged,
  primeVoices,
  readVoicePrefs,
  speak,
  VOICE_PACES,
  writeVoicePrefs,
  type VoiceInfo,
  type VoicePace,
} from "@/features/focus/lib/voice";

const SAMPLE = "Let your shoulders soften. Breathe in slowly… and out.";

/**
 * Choose the guide's voice and pace, and hear it. Voices differ by device, so
 * both choices are kept on this device rather than synced.
 */
export function VoiceOptions() {
  // Rendered only once the card's settings have loaded (never in the server HTML),
  // so reading this device's prefs and voices during the first render is safe.
  const [voices, setVoices] = useState<VoiceInfo[]>(() => availableVoices());
  const [voice, setVoice] = useState<string>(() => readVoicePrefs().voice ?? "");
  const [pace, setPace] = useState<VoicePace>(() => readVoicePrefs().pace);

  // Browsers often fill the voice list in after load; follow it.
  useEffect(() => {
    primeVoices();
    return onVoicesChanged(() => setVoices(availableVoices()));
  }, []);

  if (voices.length === 0) return null;

  const choose = (name: string) => {
    setVoice(name);
    writeVoicePrefs({ voice: name || null });
    speak(SAMPLE);
  };
  const choosePace = (p: VoicePace) => {
    setPace(p);
    writeVoicePrefs({ pace: p });
    speak(SAMPLE);
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <label className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
        <span className="shrink-0">Voice</span>
        <select
          value={voice}
          onChange={(e) => choose(e.target.value)}
          aria-label="Guide voice"
          className="min-w-0 max-w-[14rem] truncate rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 focus:border-blue-400 focus:outline-none"
        >
          <option value="">Best available</option>
          {voices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
        <span>Pace</span>
        <div className="flex gap-1.5">
          {VOICE_PACES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={pace === p.id}
              onClick={() => choosePace(p.id)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                pace === p.id
                  ? "border-blue-400/60 bg-blue-500/15 text-blue-200"
                  : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => speak(SAMPLE)}
        className="self-start rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
      >
        ▶ Hear it
      </button>
      <p className="text-[11px] text-slate-500">
        Voices named “Natural”, “Neural” or “Enhanced” sound the most human. Your
        device may let you download better ones in its speech settings.
      </p>
    </div>
  );
}
