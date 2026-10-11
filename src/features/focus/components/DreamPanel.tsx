"use client";

import { useMemo, useState } from "react";

import { ContributionsCalendar } from "@/components/ContributionsCalendar";
import { DreamBadges } from "@/features/focus/components/DreamBadges";
import { ExpandToggle } from "@/components/ExpandToggle";
import { ChevronUp } from "@/components/icons";
import { NoteText } from "@/components/NoteText";
import type { JournalNote } from "@/features/focus/lib/types";
import { EMPTY_STATE_CLASS } from "@/components/ui/EmptyState";
import { dayKeyFor, todayKey } from "@/lib/dayKey";

// A self-contained dream-tracking surface: recall stats, a recall heatmap, and a
// searchable dreams-only timeline. All derived from the journal notes already in
// memory — no schema change, no network, nothing leaves the device.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type DayNotes = { day: string; notes: JournalNote[] };

type DreamPanelProps = {
  notesByDay: DayNotes[];
};

function shiftKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return dayKeyFor(dt);
}

function dayLabel(key: string, today: string): string {
  if (key === today) return "Today";
  if (key === shiftKey(today, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${d}`;
}

function timeOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

/** First `n` words of a dream, with an ellipsis when there's more. */
function firstWords(text: string, n = 15): { preview: string; truncated: boolean } {
  const words = text.trim().split(/\s+/);
  if (words.length <= n) return { preview: text.trim(), truncated: false };
  return { preview: words.slice(0, n).join(" ") + "…", truncated: true };
}

/**
 * A single dream as a collapsible card: date · time, a 15-word preview, and its
 * insights/themes badges. Click the header to expand the full text — keeps the
 * timeline scannable. Tag buttons sit outside the toggle so they stay clickable.
 */
function DreamCard({
  note,
  today,
  onTagClick,
  query,
}: {
  note: JournalNote;
  today: string;
  onTagClick: (tag: string) => void;
  query?: string;
}) {
  const [open, setOpen] = useState(false);
  const { preview, truncated } = firstWords(note.text);
  const hasAttrs =
    note.lucid ||
    note.nightmare ||
    !!note.vividness ||
    (note.tags?.length ?? 0) > 0;

  return (
    <li className="rounded-lg border border-slate-800/70 bg-slate-950/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-slate-900/40"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] tabular-nums text-slate-500">
            {dayLabel(note.day, today)}
            {note.createdAt ? ` · ${timeOf(note.createdAt)}` : ""}
          </span>
          <NoteText
            text={open ? note.text : preview}
            highlight={query}
            className="mt-0.5 block whitespace-pre-wrap break-words text-sm text-slate-200"
          />
        </span>
        {truncated && (
          <ChevronUp
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 transition ${
              open ? "" : "rotate-180"
            }`}
          />
        )}
      </button>
      {hasAttrs && (
        <div className="px-3 pb-2">
          <DreamBadges note={note} onTagClick={onTagClick} />
        </div>
      )}
    </li>
  );
}

export function DreamPanel({ notesByDay }: DreamPanelProps) {
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [expanded, setExpanded] = useState(false);

  const dreams = useMemo(
    () =>
      notesByDay
        .flatMap((d) => d.notes)
        .filter((n) => n.kind === "dream" && n.day),
    [notesByDay]
  );

  const { counts, dreamDays } = useMemo(() => {
    const counts = new Map<string, number>();
    const dreamDays = new Set<string>();
    for (const n of dreams) {
      dreamDays.add(n.day);
      counts.set(n.day, (counts.get(n.day) ?? 0) + 1);
    }
    return { counts, dreamDays };
  }, [dreams]);

  const stats = useMemo(() => {
    const today = todayKey();
    const recall = (n: number) => {
      let c = 0;
      for (let i = 0; i < n; i++) if (dreamDays.has(shiftKey(today, -i))) c++;
      return c;
    };

    // Current streak: consecutive days with a dream, anchored at today (or
    // yesterday, so a day not yet logged doesn't zero an active run).
    let current = 0;
    let cursor: string | null = dreamDays.has(today)
      ? today
      : dreamDays.has(shiftKey(today, -1))
        ? shiftKey(today, -1)
        : null;
    while (cursor && dreamDays.has(cursor)) {
      current++;
      cursor = shiftKey(cursor, -1);
    }

    // Longest streak across the whole history.
    let longest = 0;
    let run = 0;
    let prev: string | null = null;
    for (const day of [...dreamDays].sort()) {
      run = prev && shiftKey(prev, 1) === day ? run + 1 : 1;
      if (run > longest) longest = run;
      prev = day;
    }

    return { recall7: recall(7), recall30: recall(30), current, longest };
  }, [dreamDays]);

  // Qualitative attributes: lucidity rate, vividness, nightmares, recurring tags.
  const insights = useMemo(() => {
    const total = dreams.length;
    const lucidCount = dreams.filter((d) => d.lucid).length;
    const nightmareCount = dreams.filter((d) => d.nightmare).length;
    const vivid = dreams
      .map((d) => d.vividness)
      .filter((v): v is number => typeof v === "number");
    const avgVivid = vivid.length
      ? Math.round((vivid.reduce((a, b) => a + b, 0) / vivid.length) * 10) / 10
      : 0;
    const tagFreq = new Map<string, number>();
    for (const d of dreams)
      for (const t of d.tags ?? []) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
    const topTags = [...tagFreq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12);
    return {
      lucidRate: total ? Math.round((lucidCount / total) * 100) : 0,
      avgVivid,
      nightmareCount,
      topTags,
      hasAttrs:
        lucidCount > 0 ||
        nightmareCount > 0 ||
        vivid.length > 0 ||
        tagFreq.size > 0,
    };
  }, [dreams]);

  const today = todayKey();

  const timeline = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = dreams.filter((n) => {
      if (selectedDay && n.day !== selectedDay) return false;
      if (selectedTag && !(n.tags ?? []).includes(selectedTag)) return false;
      if (q && !n.text.toLowerCase().includes(q)) return false;
      return true;
    });
    const time = (n: JournalNote) =>
      n.createdAt ? new Date(n.createdAt).getTime() : 0;
    const byDay = new Map<string, JournalNote[]>();
    for (const n of filtered) {
      const bucket = byDay.get(n.day);
      if (bucket) bucket.push(n);
      else byDay.set(n.day, [n]);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, list]) => ({
        day,
        notes: [...list].sort((a, b) => time(b) - time(a)),
      }));
  }, [dreams, query, selectedDay, selectedTag]);

  // No dreams yet → stay out of the way entirely (mirrors the journal's own
  // "only show the dream filter once dreams exist" stance).
  if (dreams.length === 0) return null;

  const STAT_TILES = [
    { label: "Recall · 7d", value: `${stats.recall7}/7` },
    { label: "Recall · 30d", value: `${stats.recall30}/30` },
    {
      label: "Current streak",
      value: `${stats.current}${stats.current > 0 ? " 🌙" : ""}`,
    },
    { label: "Longest streak", value: String(stats.longest) },
  ];

  return (
    <section className="mt-5 rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        🌙 Dream log
      </h3>

      {/* Recall stats */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {STAT_TILES.map((s) => (
          <div key={s.label} className="rounded-xl bg-slate-950/50 px-3 py-3">
            <p className="text-[11px] text-slate-500">{s.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-50">
              {s.value}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        {dreams.length} dream{dreams.length === 1 ? "" : "s"} across{" "}
        {dreamDays.size} night{dreamDays.size === 1 ? "" : "s"}
      </p>

      {expanded && (
        <>
      {/* Recall heatmap — a lit square is a night a dream was logged. */}
      <div className="mt-6">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
          Recall heatmap
        </p>
        <ContributionsCalendar
          counts={counts}
          selected={selectedDay}
          onSelect={(day) =>
            setSelectedDay((cur) => (cur === day ? "" : day))
          }
        />
      </div>

      {/* Dream insights — lucidity, vividness, nightmares, recurring themes. */}
      {insights.hasAttrs && (
        <div className="mt-6">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
            Dream insights
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="rounded-lg bg-slate-950/50 px-2.5 py-1.5">
              ✨ Lucid{" "}
              <span className="font-semibold tabular-nums text-indigo-200">
                {insights.lucidRate}%
              </span>
            </span>
            {insights.avgVivid > 0 && (
              <span className="rounded-lg bg-slate-950/50 px-2.5 py-1.5">
                Avg vividness{" "}
                <span className="font-semibold tabular-nums text-amber-200">
                  {insights.avgVivid}/5
                </span>
              </span>
            )}
            <span className="rounded-lg bg-slate-950/50 px-2.5 py-1.5">
              😱 Nightmares{" "}
              <span className="font-semibold tabular-nums text-red-200">
                {insights.nightmareCount}
              </span>
            </span>
          </div>
          {insights.topTags.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] text-slate-500">Recurring themes</p>
              <div className="flex flex-wrap gap-1.5">
                {insights.topTags.map(([tag, count]) => (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={selectedTag === tag}
                    onClick={() =>
                      setSelectedTag((cur) => (cur === tag ? "" : tag))
                    }
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium transition ${
                      selectedTag === tag
                        ? "border-indigo-400/70 bg-indigo-500/15 text-indigo-200"
                        : "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                    }`}
                  >
                    #{tag}{" "}
                    <span className="tabular-nums text-slate-500">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search + active filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your dreams…"
          aria-label="Search dreams"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-400"
        />
        {selectedDay && (
          <button
            type="button"
            onClick={() => setSelectedDay("")}
            className="shrink-0 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-200 transition hover:border-indigo-300/60"
          >
            {dayLabel(selectedDay, today)} · clear
          </button>
        )}
        {selectedTag && (
          <button
            type="button"
            onClick={() => setSelectedTag("")}
            className="shrink-0 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-200 transition hover:border-indigo-300/60"
          >
            #{selectedTag} · clear
          </button>
        )}
      </div>

      {/* Dreams-only timeline — one collapsible card per dream */}
      {timeline.length === 0 ? (
        <p className={`mt-4 ${EMPTY_STATE_CLASS}`}>
          No dreams match these filters.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {timeline
            .flatMap((d) => d.notes)
            .map((n) => (
              <DreamCard
                key={n.id}
                note={n}
                today={today}
                onTagClick={setSelectedTag}
                query={query}
              />
            ))}
        </ul>
      )}
        </>
      )}

      <ExpandToggle
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        moreLabel="Show heatmap, insights & timeline"
        className="mt-6"
      />
    </section>
  );
}

export default DreamPanel;
