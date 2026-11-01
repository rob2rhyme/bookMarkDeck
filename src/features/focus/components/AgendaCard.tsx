"use client";

import { useState } from "react";

import { DateInput, TimeInput } from "@/components/DateTimeField";
import type { AgendaEvent, NewEvent } from "@/features/focus/hooks/useGoogleEvents";
import { dayKeyFor as dayKey, dayKeyOf, todayKey } from "@/lib/dayKey";

type AgendaCardProps = {
  enabled: boolean;
  events: AgendaEvent[];
  loading: boolean;
  error: boolean;
  days: number;
  canExpand: boolean;
  canCollapse: boolean;
  onRefresh: () => void;
  /** Write-back to the primary calendar. Omitted = the card stays read-only. */
  onCreate?: (event: NewEvent) => Promise<boolean>;
  onDelete?: (event: AgendaEvent) => Promise<boolean>;
  onExpand: () => void;
  onCollapse: () => void;
};

// Secondary line: prefer the event's own description/location; fall back to the
// calendar name — but never the user's primary calendar (its name is the email).
function subtitle(e: AgendaEvent): string {
  if (e.description) return e.description;
  return e.primary ? "" : e.calendarName;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dayLabel(key: string): string {
  const today = new Date();
  if (key === dayKey(today)) return "Today";
  const t = new Date(today);
  t.setDate(today.getDate() + 1);
  if (key === dayKey(t)) return "Tomorrow";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${d}`;
}
const DURATIONS = [
  { min: 15, label: "15 min" },
  { min: 30, label: "30 min" },
  { min: 60, label: "1 hour" },
  { min: 120, label: "2 hours" },
];

/** A local date and time of day → the instant it is (this device knows the zone; the server doesn't). */
function toInstant(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

/** "Add an event" — written straight to the user's primary Google Calendar. */
function AddEventForm({
  onCreate,
  onDone,
}: {
  onCreate: (event: NewEvent) => Promise<boolean>;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => todayKey());
  const [time, setTime] = useState("09:00");
  const [allDay, setAllDay] = useState(false);
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || (!allDay && !time)) return;
    setBusy(true);
    setFailed(false);
    const ok = await onCreate({
      title: title.trim(),
      start: allDay ? date : toInstant(date, time),
      ...(allDay ? {} : { durationMin: duration }),
    });
    setBusy(false);
    if (ok) onDone();
    else setFailed(true);
  };

  const field =
    "rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 focus:border-violet-400 focus:outline-none";
  return (
    <form
      onSubmit={submit}
      className="mb-4 flex flex-col gap-2 rounded-xl border border-violet-500/30 bg-slate-950/40 p-3"
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Event title"
        aria-label="Event title"
        autoFocus
        className={`${field} w-full`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <DateInput value={date} onChange={(e) => setDate(e.target.value)} aria-label="Event date" className={field} />
        {!allDay && (
          <>
            <TimeInput value={time} onChange={(e) => setTime(e.target.value)} aria-label="Event time" className={field} />
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              aria-label="Event length"
              className={field}
            >
              {DURATIONS.map((d) => (
                <option key={d.min} value={d.min}>
                  {d.label}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-4 w-4 accent-violet-500"
          />
          All day
        </label>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-red-300">{failed ? "Couldn’t add it — try again." : ""}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDone}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add to calendar"}
          </button>
        </div>
      </div>
    </form>
  );
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function AgendaCard({
  enabled,
  events,
  loading,
  error,
  days,
  canExpand,
  canCollapse,
  onRefresh,
  onCreate,
  onDelete,
  onExpand,
  onCollapse,
}: AgendaCardProps) {
  const [adding, setAdding] = useState(false);
  // The event whose delete is awaiting its second click.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const grouped = (() => {
    const map = new Map<string, AgendaEvent[]>();
    for (const e of events) {
      // An all-day start is a bare date and already IS the day; new Date() would
      // read it as UTC midnight and file it a day early west of UTC.
      const k = e.start ? dayKeyOf(e.start) : null;
      if (!k) continue;
      const bucket = map.get(k);
      if (bucket) bucket.push(e);
      else map.set(k, [e]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  })();

  return (
    <section className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/40 via-slate-900/90 to-indigo-950/40 p-4 shadow-lg shadow-violet-950/30 sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-200">
          Agenda · Google Calendar
        </h3>
        {enabled && (
          <div className="flex items-center gap-2">
            {onCreate && (
              <button
                type="button"
                onClick={() => setAdding((a) => !a)}
                aria-expanded={adding}
                className="rounded-full border border-violet-500/50 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20"
              >
                ＋ Add event
              </button>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-violet-400 hover:text-violet-200 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        )}
      </div>

      {enabled && onCreate && adding && (
        <AddEventForm onCreate={onCreate} onDone={() => setAdding(false)} />
      )}
      {deleteFailed && (
        <p className="mb-3 text-[11px] text-red-300">Couldn’t delete that event — try again.</p>
      )}

      {!enabled ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          Enable Google sync in Settings to see your calendar agenda.
        </p>
      ) : error ? (
        <p className="rounded-lg border border-dashed border-red-700/40 bg-red-950/20 px-3 py-6 text-center text-sm text-red-300">
          Couldn’t reach Google Calendar. Sign out and back in to grant access,
          then Refresh.
        </p>
      ) : grouped.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          {loading
            ? "Loading your agenda…"
            : `No upcoming events in the next ${days} days.`}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(([key, list]) => (
            <div key={key}>
              <h4 className="mb-2 text-xs font-medium text-slate-300">
                {dayLabel(key)}
              </h4>
              <ul className="flex flex-col gap-1.5">
                {list.map((e) => (
                  <li key={`${e.calendarId}-${e.id}`} className="flex items-stretch gap-1.5">
                    <a
                      href={e.htmlLink ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 flex-1 items-baseline gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2 transition hover:border-violet-400/50"
                    >
                      <span className="w-16 shrink-0 text-xs tabular-nums text-violet-300">
                        {e.allDay || !e.start ? "All day" : timeLabel(e.start)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-100">
                          {e.title}
                        </span>
                        {subtitle(e) && (
                          <span className="block truncate text-[11px] text-slate-500">
                            {subtitle(e)}
                          </span>
                        )}
                      </span>
                    </a>
                    {/* Only your own calendar's events: shared and subscribed
                        calendars are not ours to change. Two clicks, since a
                        deleted calendar event can't be undone from here. */}
                    {onDelete && e.primary && (
                      <button
                        type="button"
                        onClick={async () => {
                          const key = `${e.calendarId}-${e.id}`;
                          if (confirming !== key) {
                            setConfirming(key);
                            setDeleteFailed(false);
                            return;
                          }
                          setConfirming(null);
                          if (!(await onDelete(e))) setDeleteFailed(true);
                        }}
                        onBlur={() => setConfirming(null)}
                        aria-label={
                          confirming === `${e.calendarId}-${e.id}`
                            ? `Confirm delete ${e.title}`
                            : `Delete ${e.title}`
                        }
                        className={`shrink-0 rounded-lg border px-2 text-xs transition ${
                          confirming === `${e.calendarId}-${e.id}`
                            ? "border-red-500/70 bg-red-500/15 text-red-200"
                            : "border-slate-800/70 text-slate-500 hover:border-red-400/60 hover:text-red-300"
                        }`}
                      >
                        {confirming === `${e.calendarId}-${e.id}` ? "Delete?" : "✕"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {enabled && !error && grouped.length > 0 && (canExpand || canCollapse) && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            Showing the next {days} days
          </span>
          <div className="flex gap-2">
            {canCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                disabled={loading}
                className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 disabled:opacity-50"
              >
                Show less
              </button>
            )}
            {canExpand && (
              <button
                type="button"
                onClick={onExpand}
                disabled={loading}
                className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-medium text-violet-300 transition hover:border-violet-400 hover:text-violet-200 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Show 90 more days"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default AgendaCard;
