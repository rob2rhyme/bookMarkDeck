"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Check, Repeat, Timer } from "@/components/icons";
import { useLetThem } from "@/features/focus/hooks/useLetThem";
import { getReframe, RESET_TRIGGERS } from "@/features/focus/lib/letThem";
import { fetchUiFlag, getCachedFlag, markUiFlag } from "@/lib/uiPrefs";
import type { ActivityType } from "@/features/focus/data/focusData";

type LetThemCardProps = {
  email?: string | null;
  connected?: boolean;
  onLog?: (type: ActivityType, summary: string, day?: string) => void;
  /** Phase 4 hand-off: start a focus block on the "let me" action. */
  onStartFocus?: (action: string) => void;
};

export function LetThemCard({
  email,
  connected = false,
  onLog,
  onStartFocus,
}: LetThemCardProps) {
  const { todayCount, streak, logReset } = useLetThem(email, connected, onLog);

  const [trigger, setTrigger] = useState("");
  const [action, setAction] = useState("");
  const [letGo, setLetGo] = useState(false);
  const [justLogged, setJustLogged] = useState(false);

  // One-time intro for newcomers, cloud-backed so it shows once ever.
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    if (getCachedFlag("letThemIntroSeen")) return;
    let cancelled = false;
    fetchUiFlag("letThemIntroSeen").then((seen) => {
      if (!cancelled && !seen) setShowIntro(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const dismissIntro = () => {
    markUiFlag("letThemIntroSeen");
    setShowIntro(false);
  };

  const reframe = getReframe(trigger);
  const canLog = trigger.trim().length > 0 || action.trim().length > 0;

  const submit = () => {
    if (!canLog) return;
    logReset(trigger.trim(), action.trim());
    setTrigger("");
    setAction("");
    setLetGo(false);
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 2200);
  };

  return (
    <div className="flex flex-col rounded-2xl border border-teal-500/25 bg-teal-950/10 p-4 shadow-sm sm:p-8">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300">
            <Repeat className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-teal-200">
              Let them
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Stuck on something you can&apos;t control? Reframe it in 60 seconds.
            </p>
          </div>
        </div>
        {streak > 0 && (
          <span className="shrink-0 rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-teal-200">
            🔥 {streak}-day
          </span>
        )}
      </div>

      {showIntro && (
        <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/40 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-slate-200">
              New here? It&apos;s just two moves.
            </p>
            <button
              type="button"
              onClick={dismissIntro}
              aria-label="Dismiss intro"
              className="text-slate-500 transition hover:text-slate-300"
            >
              ✕
            </button>
          </div>
          <p className="mt-1.5 text-[12px] text-slate-400">
            <span className="font-medium text-teal-200">Let them</span> — stop
            spending energy on what other people do.
          </p>
          <p className="mt-1 text-[12px] text-slate-400">
            <span className="font-medium text-teal-200">Let me</span> — put that
            energy where it counts: your next move.
          </p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-[13px] font-medium text-slate-200">
          1 · Name what&apos;s pulling at you
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Just getting it out of your head loosens its grip.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RESET_TRIGGERS.map((t) => {
            const on = trigger.trim().toLowerCase() === t.label.toLowerCase();
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => setTrigger(on ? "" : t.label)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  on
                    ? "border-teal-400/70 bg-teal-500/10 text-teal-200"
                    : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          placeholder="…or put it in your own words"
          aria-label="What's pulling at you"
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
        />
      </div>

      <div className="mt-4">
        <p className="text-[13px] text-slate-200">
          <span className="font-medium">2 · Let them</span>{" "}
          <span className="text-[12px] text-slate-500">
            — release what you can&apos;t control
          </span>
        </p>
        <div className="mt-2 rounded-lg border-l-[3px] border-teal-500/70 bg-teal-950/20 px-3.5 py-3">
          <p className="text-sm leading-relaxed text-teal-100">{reframe}</p>
          <button
            type="button"
            onClick={() => setLetGo((v) => !v)}
            aria-pressed={letGo}
            className="mt-2 inline-flex items-center gap-2 text-[13px] text-teal-200 transition hover:text-teal-100"
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                letGo
                  ? "border-teal-400 bg-teal-500/20 text-teal-300"
                  : "border-slate-600"
              }`}
            >
              {letGo && <Check className="h-3 w-3" />}
            </span>
            I&apos;m letting this go
          </button>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[13px] text-slate-200">
          <span className="font-medium">3 · Let me</span>{" "}
          <span className="text-[12px] text-slate-500">
            — focus on what you can
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Pick one small thing that&apos;s yours to do.
        </p>
        <input
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="The one thing I control right now…"
          aria-label="The one thing I control"
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800/70 pt-4">
        {onStartFocus && (
          <button
            type="button"
            disabled={!action.trim()}
            onClick={() => {
              submit();
              onStartFocus(action.trim());
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Timer className="h-4 w-4" /> Start a focus block
          </button>
        )}
        <button
          type="button"
          disabled={!canLog}
          onClick={submit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3.5 py-2 text-sm text-slate-200 transition hover:border-teal-400 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="h-4 w-4" /> Log reset
        </button>
        <span className="ml-auto text-[11px] text-slate-500 tabular-nums">
          {justLogged ? "Logged ✓" : `${todayCount} today`}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <Link
          href="/habits"
          className="text-[11px] text-teal-300/80 underline-offset-2 transition hover:text-teal-200 hover:underline"
        >
          Track this daily in Habits →
        </Link>
        <span className="text-[11px] text-slate-600">
          Inspired by Mel Robbins&apos; Let Them Theory
        </span>
      </div>
    </div>
  );
}

export default LetThemCard;
