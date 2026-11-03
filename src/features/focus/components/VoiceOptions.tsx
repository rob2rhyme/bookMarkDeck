"use client";

import { useEffect, useState } from "react";

import { CLOUD_VOICES, isCloudVoice, type CloudVoiceId } from "@/features/focus/lib/cloudVoiceConfig";
import {
  availableVoices,
  cloudNarrationAvailable,
  onVoicesChanged,
  primeVoices,
  readVoicePrefs,
  speak,
  VOICE_PACES,
  writeVoicePrefs,
  type VoiceEngine,
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
  const [engine, setEngine] = useState<VoiceEngine>(() => readVoicePrefs().engine);
  const [cloudVoice, setCloudVoice] = useState<CloudVoiceId>(() => readVoicePrefs().cloudVoice);
  // Offered only where the deployment has a narration key; asked once.
  const [cloudAvailable, setCloudAvailable] = useState(false);

  // Browsers often fill the voice list in after load; follow it.
  useEffect(() => {
    primeVoices();
    let alive = true;
    void cloudNarrationAvailable().then((ok) => alive && setCloudAvailable(ok));
    const stop = onVoicesChanged(() => setVoices(availableVoices()));
    return () => {
      alive = false;
      stop();
    };
  }, []);

  if (voices.length === 0 && !cloudAvailable) return null;
  const cloud = cloudAvailable && engine === "cloud";

  const chooseEngine = (e: VoiceEngine) => {
    setEngine(e);
    writeVoicePrefs({ engine: e });
    speak(SAMPLE);
  };
  const chooseCloudVoice = (id: string) => {
    if (!isCloudVoice(id)) return;
    setCloudVoice(id);
    writeVoicePrefs({ cloudVoice: id });
    speak(SAMPLE);
  };

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
      {cloudAvailable && (
        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
          <span>Voice type</span>
          <div className="flex gap-1.5" role="group" aria-label="Voice type">
            {(
              [
                ["device", "This device"],
                ["cloud", "Natural"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={engine === id}
                onClick={() => chooseEngine(id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  engine === id
                    ? "border-blue-400/60 bg-blue-500/15 text-blue-200"
                    : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {cloud && (
        <label className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
          <span className="shrink-0">Voice</span>
          <select
            value={cloudVoice}
            onChange={(e) => chooseCloudVoice(e.target.value)}
            aria-label="Natural voice"
            className="min-w-0 max-w-[14rem] truncate rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 focus:border-blue-400 focus:outline-none"
          >
            {CLOUD_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!cloud && voices.length > 0 && (
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
      )}
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
        {cloud
          ? "Natural voices are generated online, one line at a time, and each line is then kept on this device. If one can’t be fetched, this device’s voice says it instead."
          : "Voices named “Natural”, “Neural” or “Enhanced” sound the most human. Your device may let you download better ones in its speech settings."}
      </p>
    </div>
  );
}
