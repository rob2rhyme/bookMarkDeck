"use client";

// Notes → Insights. Every chart answers a magnitude question about one series,
// so each uses one hue with direct labels and no legend (as FilingInsights).
// Bars are buttons with a readout below, because hover doesn't exist on a phone.
// The activity list is the audit view: what happened to which note, and when —
// never what a note said.

import Link from "next/link";
import { useMemo, useState } from "react";

import { X } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { describeEvent, type NoteEvent } from "@/features/notes/lib/activity";
import type { DeletedEntry } from "@/features/notes/lib/deletionLog";
import { computeInsights, STALE_DAYS, type FeedItem, type NoteRank } from "@/features/notes/lib/insights";
import type { Note } from "@/features/notes/lib/notes";

// Taller than a screen with real data, so the panel scrolls (the shared default
// doesn't, and a centred overflow is unreachable at both ends).
const PANEL =
  "w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl outline-none sm:p-6";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "Oct 20, 11:41 PM" — with the year only when it isn't `now`'s. */
export function formatWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

const ROW = "flex flex-col gap-0.5 px-3 py-2 text-[12px] sm:flex-row sm:items-baseline sm:gap-3";
const WHEN = "shrink-0 tabular-nums text-slate-500 sm:w-36";

const weekLabel = (start: string) => {
  const [y, m, d] = start.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function feedLabel(item: FeedItem): string {
  if (item.event.kind === "deleted") return item.restored ? "Deleted, then restored" : "Deleted";
  return describeEvent(item.event as NoteEvent);
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-950/50 px-3 py-3">
      <p className="text-lg font-semibold tabular-nums text-slate-100">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

function Row({ label, count, max, href }: { label: string; count: number; max: number; href?: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  const text = (
    <span className="w-32 shrink-0 truncate text-[12px] text-slate-300" title={label}>
      {label}
    </span>
  );
  return (
    <li className="flex items-center gap-3">
      {href ? (
        <Link href={href} className="w-32 shrink-0 truncate text-[12px] text-slate-300 hover:text-blue-300" title={label}>
          {label}
        </Link>
      ) : (
        text
      )}
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
        <span
          className="block h-full rounded-full bg-blue-500"
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
        />
      </span>
      <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-slate-400">{count.toLocaleString()}</span>
    </li>
  );
}

function Ranked({ title, rows, unit }: { title: string; rows: NoteRank[]; unit: string }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="flex flex-col gap-2" aria-label={`${title} (${unit})`}>
        {rows.map((r) => (
          <Row key={r.id} label={r.title} count={r.value} max={rows[0].value} href={`/notes/${r.id}`} />
        ))}
      </ul>
    </div>
  );
}

/** Insights and recent activity across all notes. `now` is fixed when the dialog opens. */
export function NotesInsights({
  open,
  onClose,
  notes,
  deletions,
  now,
}: {
  open: boolean;
  onClose: () => void;
  notes: Note[];
  deletions: DeletedEntry[];
  now: Date;
}) {
  const s = useMemo(() => computeInsights(notes, deletions, now), [notes, deletions, now]);
  const [selected, setSelected] = useState<string | null>(null);
  const maxWeek = Math.max(1, ...s.weeks.map((w) => w.edits + w.created));
  const chosen = s.weeks.find((w) => w.start === selected) ?? null;
  const current = s.weeks[s.weeks.length - 1]?.start;

  return (
    <Modal open={open} onClose={onClose} labelledBy="notes-insights-title" panelClassName={PANEL}>
      <div className="flex flex-col gap-5">
        {/* First, so the dialog's initial focus (the shared Modal focuses the first
            focusable) lands at the top rather than on a chart bar halfway down. */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="notes-insights-title" className="text-lg font-semibold text-slate-50">
              Insights
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Worked out on this device from your notes. Nothing is sent anywhere or tracked.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close insights"
            className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Notes" value={s.total.toLocaleString()} />
          <Stat
            label="Words"
            value={s.words.toLocaleString()}
            hint={s.locked ? "locked notes not counted" : `about ${s.averageWords} a note`}
          />
          <Stat label="Pinned" value={s.pinned} />
          <Stat label="Locked" value={s.locked} />
          <Stat label="Without tags" value={s.untagged} />
          <Stat label="Tags in use" value={s.tags.length} />
          <Stat label="Untouched" value={s.stale.length} hint={`${STALE_DAYS}+ days`} />
          <Stat label="Deleted" value={s.deletedLast30} hint="last 30 days" />
        </div>

        {s.total === 0 ? (
          <EmptyState>Nothing to show yet. Write a note and it starts here.</EmptyState>
        ) : (
          <>
            <section>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Last 12 weeks</p>
              <div className="flex h-28 items-stretch gap-1">
                {s.weeks.map((w) => {
                  const total = w.edits + w.created;
                  const isSel = selected === w.start;
                  const isNow = w.start === current;
                  return (
                    <button
                      key={w.start}
                      type="button"
                      onClick={() => setSelected(isSel ? null : w.start)}
                      aria-label={`Week of ${weekLabel(w.start)}: ${plural(w.created, "note")} created, ${plural(w.edits, "save")}`}
                      aria-pressed={isSel}
                      className="flex h-full flex-1 cursor-pointer flex-col items-center gap-1.5 outline-none"
                    >
                      <span className="flex w-full flex-1 items-end">
                        <span
                          className={`w-full rounded transition ${
                            total > 0 ? (isNow ? "bg-blue-500" : "bg-blue-500/40") : "bg-slate-800"
                          } ${isSel ? "ring-2 ring-blue-200 ring-offset-1 ring-offset-slate-900" : "hover:brightness-125"}`}
                          style={{ height: `${Math.max((total / maxWeek) * 100, total > 0 ? 8 : 4)}%` }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 min-h-[1.25rem] text-[11px] text-slate-400">
                {chosen ? (
                  <span>
                    Week of {weekLabel(chosen.start)}: {plural(chosen.created, "note")} created,{" "}
                    {plural(chosen.edits, "save")}.
                  </span>
                ) : (
                  <span className="text-slate-500">Notes created plus saves, per week. Tap a bar for its numbers.</span>
                )}
              </div>
            </section>

            <div className="grid gap-5 sm:grid-cols-2">
              {s.tags.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Most-used tags</p>
                  <ul className="flex flex-col gap-2">
                    {s.tags.map((t) => (
                      <Row
                        key={t.tag}
                        label={`#${t.tag}`}
                        count={t.count}
                        max={s.tags[0].count}
                        href={`/notes?tag=${encodeURIComponent(t.tag)}`}
                      />
                    ))}
                  </ul>
                </div>
              )}
              <Ranked title="Most edited" rows={s.mostEdited} unit="saves" />
              <Ranked title="Longest" rows={s.longest} unit="words" />
              <Ranked title="Untouched longest" rows={s.stale.slice(0, 5)} unit="days" />
            </div>
          </>
        )}

        <section>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Recent activity</p>
          {s.feed.length === 0 ? (
            <p className="text-sm text-slate-500">No activity recorded yet.</p>
          ) : (
            <ol className="flex max-h-72 flex-col divide-y divide-slate-800 overflow-y-auto rounded-xl border border-slate-800">
              {s.feed.map((item, i) => {
                const gone = item.event.kind === "deleted" && !item.restored;
                return (
                  <li key={`${item.noteId}-${item.at}-${i}`} className={ROW}>
                    <span className={WHEN}>{formatWhen(item.at, now)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="text-slate-300">{feedLabel(item)}</span>{" "}
                      {gone ? (
                        <span className="text-slate-500">{item.title}</span>
                      ) : (
                        <Link href={`/notes/${item.noteId}`} className="text-blue-300 hover:text-blue-200">
                          {item.title}
                        </Link>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            Each note keeps its last 100 events and deletions keep the last 100, so this is recent history, not a
            permanent record. Entries never include what a note says.
          </p>
        </section>
      </div>
    </Modal>
  );
}

/** One note's history, newest first. */
export function NoteHistory({
  open,
  onClose,
  events,
  now,
}: {
  open: boolean;
  onClose: () => void;
  events: NoteEvent[];
  now: Date;
}) {
  const list = [...events].reverse();
  return (
    <Modal open={open} onClose={onClose} labelledBy="note-history-title" panelClassName={PANEL}>
      <div className="flex flex-col gap-4">
        <h2 id="note-history-title" className="text-lg font-semibold text-slate-50">
          History
        </h2>
        <ol className="flex flex-col divide-y divide-slate-800 rounded-xl border border-slate-800">
          {list.map((e, i) => (
            <li key={`${e.at}-${i}`} className={ROW}>
              <span className={WHEN}>{formatWhen(e.at, now)}</span>
              <span className="text-slate-300">
                {describeEvent(e)}
                {e.kind === "edited" && e.from && e.from !== e.at && (
                  <span className="text-slate-500"> · from {formatWhen(e.from, now)}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-[11px] text-slate-500">
          Saves within 30 minutes of each other count as one entry. History records what happened, never what the note
          said, and travels with the note when it syncs or is backed up.
        </p>
      </div>
    </Modal>
  );
}
