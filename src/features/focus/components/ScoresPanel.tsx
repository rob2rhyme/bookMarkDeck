"use client";

import { useMemo, useState } from "react";

import type { ScoreRecord } from "@/features/focus/lib/types";
import { isTopicId, topicEmoji, topicLabel } from "@/features/focus/lib/topics";
import { EMPTY_STATE_CLASS } from "@/components/ui/EmptyState";
import {
  AnswerDetailModal,
  TopicDetailModal,
} from "@/features/focus/components/ScoresDetail";

type TopicAgg = { points: number; correct: number; answered: number };

type ScoresPanelProps = {
  available: boolean;
  total: number;
  answered: number;
  correctCount: number;
  byTopic: Map<string, TopicAgg>;
  scores: ScoreRecord[];
};

function timeOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

function label(topic: string): string {
  return isTopicId(topic) ? topicLabel(topic) : topic;
}
function emoji(topic: string): string {
  return isTopicId(topic) ? topicEmoji(topic) : "✨";
}

export function ScoresPanel({
  available,
  total,
  answered,
  correctCount,
  byTopic,
  scores,
}: ScoresPanelProps) {
  const accuracy = answered > 0 ? Math.round((correctCount / answered) * 100) : 0;

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<ScoreRecord | null>(null);

  const topics = useMemo(
    () => [...byTopic.entries()].sort((a, b) => b[1].points - a[1].points),
    [byTopic]
  );

  // Full answer history, newest first (the panel scrolls it).
  const history = useMemo(
    () =>
      [...scores].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      }),
    [scores]
  );

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Scores history
      </h3>

      {!available ? (
        <p className={EMPTY_STATE_CLASS}>
          Sign in to sync to keep your quiz points.
        </p>
      ) : answered === 0 ? (
        <p className={EMPTY_STATE_CLASS}>
          No points yet. Answer a quick quiz in “Need a push?” to start your
          score.
        </p>
      ) : (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Points", value: total.toLocaleString() },
              { label: "Answered", value: String(answered) },
              { label: "Accuracy", value: `${accuracy}%` },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3 text-center"
              >
                <p className="text-xl font-semibold tabular-nums text-slate-50">
                  {stat.value}
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          {/* Per-topic breakdown — tap a topic for its full detail + graphs */}
          {topics.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {topics.map(([topic, agg]) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setSelectedTopic(topic)}
                  className="rounded-full border border-slate-700 bg-slate-950/40 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-blue-400/70 hover:bg-slate-900 hover:text-slate-100"
                >
                  {emoji(topic)} {label(topic)} ·{" "}
                  <span className="tabular-nums text-slate-200">{agg.points}</span> pts
                </button>
              ))}
            </div>
          )}

          {/* Answer history — full, newest first; tap a row for its detail */}
          <div className="mt-5 rounded-xl border border-slate-800/70 bg-slate-950/30">
            <p className="px-4 py-3 text-sm font-medium text-slate-200">
              Answer history{" "}
              <span className="text-xs font-normal text-slate-500">
                ({history.length})
              </span>
            </p>
            <ol className="max-h-80 overflow-y-auto px-4 pb-3">
              {history.map((s) => (
                <li
                  key={s.id}
                  className="border-t border-slate-800/60 first:border-t-0"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedAnswer(s)}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-900/60"
                  >
                    <span className="flex min-w-0 items-baseline gap-2 text-[13px] text-slate-300">
                      <span aria-hidden="true">{emoji(s.topic)}</span>
                      <span className="min-w-0 truncate">{s.question}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      <span
                        className={
                          s.correct
                            ? "font-medium tabular-nums text-emerald-300"
                            : "text-rose-300"
                        }
                      >
                        {s.correct ? `+${s.points}` : "✗"}
                      </span>
                      {s.createdAt && (
                        <span className="tabular-nums text-slate-500">
                          {timeOf(s.createdAt)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <TopicDetailModal
            open={selectedTopic !== null}
            onClose={() => setSelectedTopic(null)}
            topic={selectedTopic}
            records={scores}
          />
          <AnswerDetailModal
            open={selectedAnswer !== null}
            onClose={() => setSelectedAnswer(null)}
            record={selectedAnswer}
          />
        </>
      )}
    </section>
  );
}

export default ScoresPanel;
