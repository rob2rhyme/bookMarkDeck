"use client";

// Meditation card — guided breathing pacer, a plain timed sit, and a small
// library of offline guide scripts. Owns useMeditation (like PomodoroTimer owns
// its timer). Selections persist via onUpdate (settings). Motion is gated by
// prefers-reduced-motion.

import { useState } from "react";

import { ExpandToggle } from "@/components/ExpandToggle";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { breathScale, patternById, phaseAt, BREATH_PATTERNS } from "@/features/focus/lib/breathing";
import {
  MEDITATION_GUIDES,
  type MeditationGuide,
} from "@/features/focus/lib/meditationContent";
import { AMBIENT_OPTIONS } from "@/features/focus/lib/sound";
import { useMeditation } from "@/features/focus/hooks/useMeditation";
import type { ActivityType, MeditationKind } from "@/features/focus/data/focusData";
import type { FocusSettings } from "@/features/focus/lib/settings";

const MINUTE_OPTIONS = [2, 5, 10, 15, 20] as const;

type MeditationCardProps = {
  email?: string | null;
  connected: boolean;
  settings: FocusSettings;
  onUpdate: (patch: Partial<FocusSettings>) => void;
  onLog?: (type: ActivityType, summary: string, day?: string) => void;
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
};

export function MeditationCard({
  email,
  connected,
  settings,
  onUpdate,
  onLog,
}: MeditationCardProps) {
  const reduced = usePrefersReducedMotion();
  const med = useMeditation({
    email,
    connected,
    soundEnabled: settings.soundEnabled,
    chimeSound: settings.chimeSound,
    voice: settings.meditationVoice,
    ambient: settings.meditationAmbient,
    onLog,
  });

  const [mode, setMode] = useState<MeditationKind>("breath");
  const [activeMode, setActiveMode] = useState<MeditationKind>("breath");
  const [activeGuide, setActiveGuide] = useState<MeditationGuide | null>(null);
  const [guidesOpen, setGuidesOpen] = useState(false);
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  const pattern = patternById(settings.meditationPattern);
  const minutes = settings.meditationMinutes;

  const beginGuide = (guide: MeditationGuide) => {
    setActiveMode("guide");
    setActiveGuide(guide);
    med.start({ kind: "guide", minutes: guide.minutes, steps: guide.steps });
  };

  const begin = (kind: MeditationKind, mins = minutes, patternId?: string) => {
    setActiveMode(kind);
    setActiveGuide(null);
    med.start({ kind, minutes: mins, patternId });
  };

  // Pacer geometry while a breath session runs.
  const pa = phaseAt(pattern, med.elapsedSec);
  const scale = reduced ? 0.85 : breathScale(pattern, med.elapsedSec);

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-100">🧘 Meditation</h3>
        <span className="text-xs text-slate-500">
          {med.todayMinutes > 0 ? `${med.todayMinutes} min today` : "Take a breath"}
        </span>
      </div>

      {med.running ? (
        <div className="flex flex-col items-center gap-5 py-2">
          {activeMode === "breath" ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-44 w-44 items-center justify-center">
                <div
                  className="flex h-44 w-44 items-center justify-center rounded-full bg-blue-500/15 ring-1 ring-inset ring-blue-400/30"
                  style={{
                    transform: `scale(${scale})`,
                    transition: reduced ? undefined : "transform 200ms linear",
                  }}
                >
                  <div className="text-center">
                    <p className="text-sm font-medium text-blue-200">{pa.phase.label}</p>
                    <p className="text-2xl font-semibold tabular-nums text-slate-100">
                      {Math.ceil(pa.phaseRemaining)}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-xs tabular-nums text-slate-400">
                {fmt(med.elapsedSec)} elapsed · {fmt(med.remainingSec)} left
              </p>
            </div>
          ) : (
            <div className="flex h-44 w-44 flex-col items-center justify-center rounded-full bg-blue-500/10 ring-1 ring-inset ring-blue-400/20">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                {activeMode === "guide" ? "Guided" : "Quiet sit"}
              </p>
              <p className="text-3xl font-semibold tabular-nums text-slate-100">
                {fmt(med.remainingSec)}
              </p>
            </div>
          )}
          {activeMode === "guide" && activeGuide && (
            <ol className="w-full max-w-sm space-y-1.5">
              {activeGuide.steps.map((s, i) => {
                const current = i === med.guideStep;
                return (
                  <li
                    key={i}
                    className={`rounded-lg border px-3 py-2 text-[13px] leading-snug transition ${
                      current
                        ? "border-blue-400/60 bg-blue-500/10 text-slate-100"
                        : i < med.guideStep
                          ? "border-slate-800/60 bg-slate-950/30 text-slate-500"
                          : "border-slate-800/60 bg-slate-950/30 text-slate-300"
                    }`}
                  >
                    {s}
                  </li>
                );
              })}
            </ol>
          )}
          <button
            type="button"
            onClick={med.stop}
            className="rounded-full border border-slate-700 bg-slate-900 px-5 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
          >
            End session
          </button>
        </div>
      ) : (
        <>
          {/* Mode */}
          <div className="flex gap-2">
            {([
              ["breath", "Breathe"],
              ["sit", "Quiet sit"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  mode === m
                    ? "border-blue-400/60 bg-blue-500/15 text-blue-200"
                    : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Breathing pattern */}
          {mode === "breath" && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">
                Pattern
              </p>
              <div className="flex flex-wrap gap-2">
                {BREATH_PATTERNS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={pattern.id === p.id}
                    title={p.description}
                    onClick={() => onUpdate({ meditationPattern: p.id })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      pattern.id === p.id
                        ? "border-blue-400/60 bg-blue-500/15 text-blue-200"
                        : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">{pattern.description}</p>
            </div>
          )}

          {/* Duration */}
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">
              Length
            </p>
            <div className="flex flex-wrap gap-2">
              {MINUTE_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={minutes === m}
                  onClick={() => onUpdate({ meditationMinutes: m })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums transition ${
                    minutes === m
                      ? "border-blue-400/60 bg-blue-500/15 text-blue-200"
                      : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          {/* Voice guide */}
          <div className="mt-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">
                Voice guide
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.meditationVoice}
                onClick={() =>
                  onUpdate({ meditationVoice: !settings.meditationVoice })
                }
                className={`relative h-5 w-9 rounded-full transition ${
                  settings.meditationVoice ? "bg-blue-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                    settings.meditationVoice ? "left-4" : "left-0.5"
                  }`}
                />
              </button>
            </label>
            <p className="mt-1 text-[11px] text-slate-500">
              Speaks each breath cue or guide step aloud.
            </p>
          </div>

          {/* Ambient sound */}
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">
              Ambient sound
            </p>
            <div className="flex flex-wrap gap-2">
              {AMBIENT_OPTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={settings.meditationAmbient === a.id}
                  onClick={() => onUpdate({ meditationAmbient: a.id })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    settings.meditationAmbient === a.id
                      ? "border-blue-400/60 bg-blue-500/15 text-blue-200"
                      : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => begin(mode, minutes, mode === "breath" ? pattern.id : undefined)}
            className="mt-5 w-full rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Start {minutes}-min {mode === "breath" ? "breathing" : "sit"}
          </button>
          {!connected && (
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Sign in to sync to save sessions to your history.
            </p>
          )}

          {/* Guides */}
          <div className="mt-5 border-t border-slate-800/70 pt-3">
            <ExpandToggle
              expanded={guidesOpen}
              onToggle={() => setGuidesOpen((v) => !v)}
              moreLabel={`Guided meditations (${MEDITATION_GUIDES.length})`}
              lessLabel="Hide guided meditations"
            />
            {guidesOpen && (
              <ul className="mt-2 flex flex-col gap-2">
                {MEDITATION_GUIDES.map((g) => {
                  const open = openGuide === g.id;
                  return (
                    <li
                      key={g.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setOpenGuide(open ? null : g.id)}
                          className="min-w-0 flex-1 text-left"
                          aria-expanded={open}
                        >
                          <span className="block text-sm font-medium text-slate-100">
                            {g.title}{" "}
                            <span className="text-xs text-slate-500">· {g.minutes}m</span>
                          </span>
                          <span className="block truncate text-xs text-slate-400">
                            {g.blurb}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => beginGuide(g)}
                          className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
                        >
                          Start
                        </button>
                      </div>
                      {open && (
                        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-300">
                          {g.steps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default MeditationCard;
