"use client";

// Drill-down detail for the Scores history panel: a per-topic breakdown (stats,
// accuracy bar, points-by-day chart, difficulty split, full answer list) and a
// single-answer detail. Both open after a user click (post-mount), so the
// locale-formatted timestamps never cause a hydration mismatch.

import { useMemo } from "react";

import Modal from "@/components/Modal";
import { Check, X } from "@/components/icons";
import { isTopicId, topicEmoji, topicLabel } from "@/features/focus/lib/topics";
import type { ScoreRecord } from "@/features/focus/lib/types";

const LEVELS = ["Easy", "Medium", "Hard"] as const;
const LEVEL_TINT: Record<string, string> = {
  Easy: "text-emerald-300",
  Medium: "text-amber-300",
  Hard: "text-rose-300",
};

function tLabel(topic: string): string {
  return isTopicId(topic) ? topicLabel(topic) : topic;
}
function tEmoji(topic: string): string {
  return isTopicId(topic) ? topicEmoji(topic) : "✨";
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayShort(day: string): string {
  const parts = day.split("-");
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : day;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3 text-center">
      <p className="text-xl font-semibold tabular-nums text-slate-50">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
    </div>
  );
}

/* ----------------------------------------------- per-topic detail modal --- */

export function TopicDetailModal({
  open,
  onClose,
  topic,
  records,
}: {
  open: boolean;
  onClose: () => void;
  topic: string | null;
  records: ScoreRecord[];
}) {
  const mine = useMemo(
    () =>
      topic == null
        ? []
        : [...records]
            .filter((r) => r.topic === topic)
            .sort((a, b) => {
              const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return tb - ta;
            }),
    [records, topic]
  );

  const points = mine.reduce((s, r) => s + (r.points || 0), 0);
  const correct = mine.filter((r) => r.correct).length;
  const accuracy = mine.length ? Math.round((correct / mine.length) * 100) : 0;

  // Points per day (chronological, last 14 active days).
  const days = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of mine) map.set(r.day, (map.get(r.day) ?? 0) + (r.points || 0));
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-14);
  }, [mine]);
  const maxDayPts = days.reduce((m, [, p]) => Math.max(m, p), 0) || 1;

  const byLevel = useMemo(
    () =>
      LEVELS.map((lvl) => {
        const rs = mine.filter((r) => r.level === lvl);
        const c = rs.filter((r) => r.correct).length;
        return {
          level: lvl,
          answered: rs.length,
          acc: rs.length ? Math.round((c / rs.length) * 100) : 0,
        };
      }).filter((l) => l.answered > 0),
    [mine]
  );

  if (topic == null) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={`${tLabel(topic)} scores detail`}
      panelClassName="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl outline-none sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
          <span aria-hidden="true">{tEmoji(topic)}</span> {tLabel(topic)}
        </h3>
        <CloseButton onClose={onClose} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Points" value={points.toLocaleString()} />
        <Stat label="Answered" value={String(mine.length)} />
        <Stat label="Accuracy" value={`${accuracy}%`} />
      </div>

      {/* Accuracy bar */}
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
          <span className="uppercase tracking-wide">Accuracy</span>
          <span className="tabular-nums text-slate-300">
            {correct}/{mine.length} correct
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-emerald-500/70"
            style={{ width: `${accuracy}%` }}
          />
        </div>
      </div>

      {/* Points by day */}
      {days.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">
            Points by day
          </p>
          <div className="flex h-20 items-end gap-1.5">
            {days.map(([day, pts]) => (
              <div key={day} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    title={`${dayShort(day)}: ${pts} pts`}
                    className="w-full rounded bg-blue-500/50"
                    style={{
                      height: `${Math.max((pts / maxDayPts) * 100, pts > 0 ? 8 : 3)}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-slate-500">
                  {dayShort(day)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Difficulty split */}
      {byLevel.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {byLevel.map((l) => (
            <span
              key={l.level}
              className="rounded-full border border-slate-700 bg-slate-950/40 px-2.5 py-1 text-[11px] text-slate-300"
            >
              <span className={`font-medium ${LEVEL_TINT[l.level]}`}>
                {l.level}
              </span>{" "}
              · {l.answered}q · {l.acc}%
            </span>
          ))}
        </div>
      )}

      {/* Full answer list */}
      <div className="mt-5">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
          All answers ({mine.length})
        </p>
        <ol className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {mine.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2.5 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  s.correct
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-rose-500/15 text-rose-300"
                }`}
              >
                {s.correct ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-slate-200">
                  {s.question}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className={LEVEL_TINT[s.level] ?? "text-slate-400"}>
                    {s.level}
                  </span>
                  <span className="tabular-nums">{fmtDateTime(s.createdAt)}</span>
                </span>
              </span>
              <span
                className={`shrink-0 text-xs tabular-nums ${
                  s.correct ? "font-medium text-emerald-300" : "text-slate-600"
                }`}
              >
                {s.correct ? `+${s.points}` : "0"}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}

/* -------------------------------------------- single-answer detail modal --- */

export function AnswerDetailModal({
  open,
  onClose,
  record,
}: {
  open: boolean;
  onClose: () => void;
  record: ScoreRecord | null;
}) {
  if (record == null) return null;
  const s = record;

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="Answer detail"
      panelClassName="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl outline-none sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              s.correct
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300"
            }`}
          >
            {s.correct ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </span>
          <h3
            className={`text-base font-semibold ${
              s.correct ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {s.correct ? `Correct · +${s.points}` : "Incorrect"}
          </h3>
        </div>
        <CloseButton onClose={onClose} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-slate-700 bg-slate-950/40 px-2.5 py-1 text-[11px] text-slate-300">
          {tEmoji(s.topic)} {tLabel(s.topic)}
        </span>
        <span
          className={`rounded-full border border-slate-700 bg-slate-950/40 px-2.5 py-1 text-[11px] ${
            LEVEL_TINT[s.level] ?? "text-slate-300"
          }`}
        >
          {s.level}
        </span>
      </div>

      <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Question
        </p>
        <p className="text-sm leading-relaxed text-slate-200">{s.question}</p>
      </div>

      <p className="mt-3 text-[11px] tabular-nums text-slate-500">
        Answered {fmtDateTime(s.createdAt)}
      </p>
    </Modal>
  );
}
