"use client";

import { useMemo } from "react";

import type { ScoreRecord } from "@/features/focus/data/focusData";
import { isTopicId, topicEmoji, topicLabel } from "@/features/focus/lib/topics";

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

  const topics = useMemo(
    () => [...byTopic.entries()].sort((a, b) => b[1].points - a[1].points),
    [byTopic]
  );

  const recent = useMemo(
    () =>
      [...scores]
        .sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        })
        .slice(0, 8),
    [scores]
  );

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Scores history
      </h3>

      {!available ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-400">
          Sign in to sync to keep your quiz points.
        </p>
      ) : answered === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-400">
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

          {/* Per-topic breakdown */}
          {topics.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {topics.map(([topic, agg]) => (
                <span
                  key={topic}
                  className="rounded-full border border-slate-700 bg-slate-950/40 px-2.5 py-1 text-[11px] text-slate-300"
                >
                  {emoji(topic)} {label(topic)} ·{" "}
                  <span className="tabular-nums text-slate-200">{agg.points}</span> pts
                </span>
              ))}
            </div>
          )}

          {/* Recent answers */}
          <div className="mt-5 rounded-xl border border-slate-800/70 bg-slate-950/30">
            <p className="px-4 py-3 text-sm font-medium text-slate-200">
              Recent answers
            </p>
            <ol className="px-4 pb-3">
              {recent.map((s) => (
                <li
                  key={s.id}
                  className="flex items-baseline justify-between gap-3 border-t border-slate-800/60 py-2 first:border-t-0"
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
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}

export default ScoresPanel;
