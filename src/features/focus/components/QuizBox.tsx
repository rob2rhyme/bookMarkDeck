"use client";

import { useEffect, useMemo, useState } from "react";

import { Check, X } from "@/components/icons";
import type { QuizResult } from "@/features/focus/hooks/useFocusScores";
import {
  POINTS,
  type Quiz,
  type QuizDifficulty,
  type TopicId,
  quizzesFor,
  topicEmoji,
  topicLabel,
} from "@/features/focus/lib/topics";

type QuizBoxProps = {
  interests: TopicId[];
  /** Difficulty floor — harder questions only. Defaults to all levels. */
  difficulty?: QuizDifficulty;
  /** Persist the answer (score + activity). No-op when not signed in. */
  onAnswered?: (result: QuizResult) => void;
  /** Whether answers are being saved (drives the "sign in to save" hint). */
  saving?: boolean;
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const LEVEL_BADGE: Record<Quiz["level"], string> = {
  Easy: "border-emerald-500/40 text-emerald-300",
  Medium: "border-amber-500/40 text-amber-300",
  Hard: "border-rose-500/40 text-rose-300",
};

export function QuizBox({
  interests,
  difficulty = "all",
  onAnswered,
  saving = false,
}: QuizBoxProps) {
  const pool = useMemo(
    () => quizzesFor(interests, difficulty),
    [interests, difficulty]
  );

  // Deterministic first render (index 0) → randomize after mount to avoid a
  // hydration mismatch, matching QuoteBox.
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [sessionPoints, setSessionPoints] = useState(0);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    setIdx(Math.floor(Math.random() * pool.length));
    setPicked(null);
    // Re-pick when the interest pool changes; keep session score running.
  }, [pool]);

  const quiz = pool[idx % pool.length] ?? pool[0];
  const answered = picked !== null;
  const correct = answered && picked === quiz.answer;

  const choose = (choice: number) => {
    if (answered) return;
    setPicked(choice);
    const isRight = choice === quiz.answer;
    const points = isRight ? POINTS[quiz.level] : 0;
    setSessionPoints((p) => p + points);
    setStreak((s) => (isRight ? s + 1 : 0));
    onAnswered?.({
      topic: quiz.topic,
      level: quiz.level,
      correct: isRight,
      points,
      question: quiz.question,
    });
  };

  const next = () => {
    if (pool.length <= 1) {
      setPicked(null);
      return;
    }
    let n = idx;
    while (n === idx) n = Math.floor(Math.random() * pool.length);
    setIdx(n);
    setPicked(null);
  };

  const choiceClass = (i: number) => {
    if (!answered) {
      return "border-slate-700 bg-slate-950/40 text-slate-200 hover:border-blue-400/70 hover:bg-slate-900";
    }
    if (i === quiz.answer) return "border-emerald-500/60 bg-emerald-950/30 text-emerald-200";
    if (i === picked) return "border-rose-500/60 bg-rose-950/30 text-rose-200";
    return "border-slate-800 bg-slate-950/30 text-slate-500";
  };

  return (
    <div className="mt-6 rounded-xl border border-blue-500/25 bg-blue-950/10 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-200/90">
            🧠 Quick quiz
          </span>
          <span className="rounded-full border border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
            {topicEmoji(quiz.topic)} {topicLabel(quiz.topic)}
          </span>
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${LEVEL_BADGE[quiz.level]}`}
          >
            {quiz.level}
          </span>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
          {sessionPoints} pts
          {streak > 1 ? ` · 🔥 ${streak}` : ""}
        </span>
      </div>

      <p className="text-[15px] font-medium leading-relaxed text-slate-100">
        {quiz.question}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {quiz.choices.map((choice, i) => {
          const isAnswer = answered && i === quiz.answer;
          const isWrongPick = answered && i === picked && i !== quiz.answer;
          return (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              disabled={answered}
              aria-pressed={picked === i}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[13px] leading-snug transition disabled:cursor-default ${choiceClass(i)}`}
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-current text-[11px] font-semibold opacity-60"
              >
                {LETTERS[i] ?? "•"}
              </span>
              <span className="min-w-0 flex-1 break-words">{choice}</span>
              {isAnswer && (
                <Check className="h-4 w-4 shrink-0 text-emerald-300" />
              )}
              {isWrongPick && <X className="h-4 w-4 shrink-0 text-rose-300" />}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-3">
          {/* Result badge — premium icon in a tinted circle */}
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                correct
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-rose-500/15 text-rose-300"
              }`}
            >
              {correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            </span>
            <p
              className={`text-[13px] font-semibold ${correct ? "text-emerald-300" : "text-rose-300"}`}
            >
              {correct
                ? `Correct! +${POINTS[quiz.level]} points`
                : `Not quite — the answer is “${quiz.choices[quiz.answer]}”.`}
            </p>
          </div>

          {/* Why this answer */}
          {quiz.explain && (
            <div className="mt-2.5 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <span aria-hidden="true">{topicEmoji(quiz.topic)}</span> Why
              </p>
              <p className="text-[13px] leading-relaxed text-slate-300">
                {quiz.explain}
              </p>
            </div>
          )}

          {/* Did you know? — bonus interesting fact */}
          {quiz.fact && (
            <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-950/15 p-3">
              <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">
                <span aria-hidden="true">💡</span> Did you know?
              </p>
              <p className="text-[13px] leading-relaxed text-amber-100/85">
                {quiz.fact}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={next}
            className="mt-3 rounded-lg border border-slate-700 px-3.5 py-1.5 text-[13px] text-slate-200 transition hover:border-blue-400 hover:bg-slate-900"
          >
            Next question →
          </button>
        </div>
      )}

      {!saving && (
        <p className="mt-3 text-[11px] text-slate-500">
          Sign in to sync to save your points to Scores history.
        </p>
      )}
    </div>
  );
}

export default QuizBox;
