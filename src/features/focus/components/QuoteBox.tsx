"use client";

import { useEffect, useMemo, useState } from "react";

import {
  dayOfYear,
  KIND_BADGE,
  LEVEL_BADGE,
} from "@/features/focus/lib/content";
import { useFocusContent } from "@/features/focus/hooks/useFocusContent";
import type { QuizResult } from "@/features/focus/hooks/useFocusScores";
import { QuizBox } from "@/features/focus/components/QuizBox";
import {
  quotesFor,
  showsCoding,
  type QuizDifficulty,
  type TopicId,
} from "@/features/focus/lib/topics";

type QuoteBoxProps = {
  email?: string | null;
  connected?: boolean;
  interests?: TopicId[];
  quizDifficulty?: QuizDifficulty;
  onQuizAnswered?: (result: QuizResult) => void;
};

export function QuoteBox({
  email,
  connected = false,
  interests = [],
  quizDifficulty = "all",
  onQuizAnswered,
}: QuoteBoxProps) {
  // Defaults render instantly; per-user extras from Firestore merge in live.
  const { quotes, nuggets, challenges } = useFocusContent(email, connected);

  // Quotes are drawn from the chosen interests; code blocks show only for
  // code-leaning interests (so a kid on Music/Math/Astronomy doesn't get JS).
  const pool = useMemo(() => quotesFor(interests, quotes), [interests, quotes]);
  const showCode = showsCoding(interests);

  // Deterministic first render (index 0) → pick after mount to avoid a
  // hydration mismatch. The quote is random; nugget + challenge are "of the day".
  const [idx, setIdx] = useState(0);
  const [nug, setNug] = useState(0);
  const [chal, setChal] = useState(0);
  const [fading, setFading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [solCopied, setSolCopied] = useState(false);

  useEffect(() => {
    setIdx(Math.floor(Math.random() * pool.length));
    setNug(dayOfYear() % nuggets.length);
    setChal(dayOfYear() % challenges.length);
    // Pick once on mount; later content growth just keeps these valid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quote = pool[idx % pool.length] ?? pool[0];
  const nugget = nuggets[nug % nuggets.length] ?? nuggets[0];
  const challenge = challenges[chal % challenges.length] ?? challenges[0];
  const badge = KIND_BADGE[nugget.kind];

  const next = () => {
    setFading(true);
    setTimeout(() => {
      setIdx((i) => (i + 1) % pool.length);
      setFading(false);
    }, 200);
  };

  const nextNugget = () => {
    setCopied(false);
    setNug((n) => (n + 1) % nuggets.length);
  };

  const nextChallenge = () => {
    setShowSolution(false);
    setSolCopied(false);
    setChal((c) => (c + 1) % challenges.length);
  };

  const copySolution = () => {
    if (!challenge.solution) return;
    navigator.clipboard?.writeText(challenge.solution).then(
      () => {
        setSolCopied(true);
        setTimeout(() => setSolCopied(false), 1500);
      },
      () => {}
    );
  };

  const copy = () => {
    if (nugget.kind !== "snippet") return;
    navigator.clipboard?.writeText(nugget.code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  };

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Need a push?
      </h3>
      <div
        className={`border-l-[3px] border-violet-500/70 pl-4 transition-opacity duration-200 ${
          fading ? "opacity-0" : "opacity-100"
        }`}
      >
        <p className="text-[15px] italic leading-relaxed text-slate-200">
          “{quote.text}”
        </p>
        {quote.author && (
          <p className="mt-1.5 text-xs text-slate-400">— {quote.author}</p>
        )}
      </div>
      <button
        type="button"
        onClick={next}
        className="mt-4 rounded-lg border border-slate-700 px-3.5 py-1.5 text-[13px] text-slate-300 transition hover:border-slate-500 hover:bg-slate-800/60"
      >
        New quote ↺
      </button>

      {/* Interactive quiz — interest-aware, scores logged to Activity + Scores */}
      <QuizBox
        interests={interests}
        difficulty={quizDifficulty}
        onAnswered={onQuizAnswered}
        saving={connected}
      />

      {/* Code of the day + daily challenge — only for code-leaning interests */}
      {showCode && (
        <>
      <div className="mt-6 border-t border-slate-800/60 pt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Code of the day
            </span>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>
          <button
            type="button"
            onClick={nextNugget}
            aria-label="Show another"
            className="text-[12px] text-slate-400 transition hover:text-slate-200"
          >
            New ↺
          </button>
        </div>

        {nugget.kind === "snippet" ? (
          <>
            <div className="group relative">
              <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-[13px] leading-relaxed text-emerald-200">
                <code>{nugget.code}</code>
              </pre>
              <button
                type="button"
                onClick={copy}
                className="absolute right-1.5 top-1.5 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-300 opacity-0 transition hover:border-slate-500 hover:text-slate-100 focus:opacity-100 group-hover:opacity-100"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-[13px] text-slate-400">{nugget.note}</p>
          </>
        ) : nugget.kind === "shortcut" ? (
          <>
            <kbd className="inline-block rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-1.5 font-mono text-[13px] text-slate-200">
              {nugget.keys}
            </kbd>
            <p className="mt-2 text-[13px] text-slate-400">{nugget.note}</p>
          </>
        ) : (
          <p className="text-[14px] leading-relaxed text-slate-300">
            {nugget.note}
          </p>
        )}
      </div>

      {/* Daily challenge — always visible, its own dedicated block */}
      <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-950/10 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">
              🧩 Daily challenge
            </span>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${LEVEL_BADGE[challenge.level]}`}
            >
              {challenge.level}
            </span>
          </div>
          <button
            type="button"
            onClick={nextChallenge}
            aria-label="Show another challenge"
            className="text-[12px] text-amber-200/70 transition hover:text-amber-100"
          >
            New ↺
          </button>
        </div>
        <p className="text-[14px] leading-relaxed text-slate-100">
          {challenge.prompt}
        </p>

        {challenge.solution ? (
          <>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500">
                Try it in a scratch file first.
              </p>
              <button
                type="button"
                onClick={() => setShowSolution((v) => !v)}
                aria-expanded={showSolution}
                className="shrink-0 text-[12px] font-medium text-amber-200/80 transition hover:text-amber-100"
              >
                {showSolution ? "Hide solution ▴" : "Show solution ▾"}
              </button>
            </div>
            {showSolution && (
              <div className="group relative mt-2">
                <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-[13px] leading-relaxed text-amber-100">
                  <code>{challenge.solution}</code>
                </pre>
                <button
                  type="button"
                  onClick={copySolution}
                  className="absolute right-1.5 top-1.5 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-300 opacity-0 transition hover:border-slate-500 hover:text-slate-100 focus:opacity-100 group-hover:opacity-100"
                >
                  {solCopied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">
            Spin up a scratch file and give it a go before your next break.
          </p>
        )}
      </div>
        </>
      )}
    </section>
  );
}

export default QuoteBox;
