"use client";

import type { AgendaEvent } from "@/features/focus/hooks/useGoogleEvents";

type AgendaCardProps = {
  enabled: boolean;
  events: AgendaEvent[];
  loading: boolean;
  error: boolean;
  days: number;
  canExpand: boolean;
  canCollapse: boolean;
  onRefresh: () => void;
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

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}
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
function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function startDayKey(iso: string): string {
  // All-day events use a date string (no time); both parse fine.
  return dayKey(new Date(iso));
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
  onExpand,
  onCollapse,
}: AgendaCardProps) {
  const grouped = (() => {
    const map = new Map<string, AgendaEvent[]>();
    for (const e of events) {
      if (!e.start) continue;
      const k = startDayKey(e.start);
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
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-violet-400 hover:text-violet-200 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

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
                  <li key={`${e.calendarId}-${e.id}`}>
                    <a
                      href={e.htmlLink ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-baseline gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2 transition hover:border-violet-400/50"
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
