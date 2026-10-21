// "Your week": this week so far against last week, across the pillars. Pure —
// the card gathers each pillar's records and this counts them (weeklyRecap.test.ts).
//
// Weeks start on Monday and are LOCAL days (@/lib/dayKey), as Notes' insights
// are. This week is Monday to today and last week is the seven days before, so
// the two are shown side by side rather than as a change: on a Tuesday, "down"
// against a whole week would only say that the week is young.

import { dayKeyFor, dayKeyOf } from "@/lib/dayKey";

export type RecapWeek = { start: string; end: string };

/** This week (Monday → today) and last week (the Monday–Sunday before it). */
export function recapWeeks(now: Date): { thisWeek: RecapWeek; lastWeek: RecapWeek } {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (day.getDay() + 6) % 7;
  const monday = new Date(day.getFullYear(), day.getMonth(), day.getDate() - sinceMonday);
  const lastMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);
  const lastSunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 1);
  return {
    thisWeek: { start: dayKeyFor(monday), end: dayKeyFor(day) },
    lastWeek: { start: dayKeyFor(lastMonday), end: dayKeyFor(lastSunday) },
  };
}

const within = (key: string | null, w: RecapWeek) => key !== null && key >= w.start && key <= w.end;

/** The local day of a `YYYY-MM-DD` or an ISO instant, or null when unreadable. */
function dayOf(value: string | null | undefined): string | null {
  return value ? dayKeyOf(value) : null;
}

export type RecapSources = {
  /** null while the cloud's sessions aren't available (not connected yet). */
  focusSessions: { day: string; focusMin: number }[] | null;
  habitEntries: { day: string; status: string }[];
  bookmarks: { createdAt?: string | null }[];
  notes: { createdAt?: string | null; updatedAt?: string | null }[];
  items: { createdAt?: string | null }[];
};

export type RecapRow = {
  key: "focus" | "habits" | "bookmarks" | "notes-written" | "notes-edited" | "items";
  label: string;
  href: string;
  thisWeek: number;
  lastWeek: number;
  /** "minutes" is shown as hours and minutes; everything else is a count. */
  unit: "minutes" | "count";
  /** Extra context under the row, e.g. "6 sessions". */
  detail?: string;
};

function count<T>(list: T[], week: RecapWeek, pick: (t: T) => string | null): number {
  let n = 0;
  for (const t of list) if (within(pick(t), week)) n++;
  return n;
}

/** Rows with activity in either week, in a fixed order. Empty when nothing happened in both. */
export function computeWeeklyRecap(src: RecapSources, now: Date): RecapRow[] {
  const { thisWeek, lastWeek } = recapWeeks(now);
  const rows: RecapRow[] = [];

  if (src.focusSessions) {
    const minutes = (w: RecapWeek) =>
      src.focusSessions!.reduce((s, r) => (within(dayOf(r.day), w) ? s + Math.max(0, r.focusMin || 0) : s), 0);
    const sessions = count(src.focusSessions, thisWeek, (r) => dayOf(r.day));
    rows.push({
      key: "focus",
      label: "Focus",
      href: "/focus",
      thisWeek: Math.round(minutes(thisWeek)),
      lastWeek: Math.round(minutes(lastWeek)),
      unit: "minutes",
      detail: sessions ? `${sessions} ${sessions === 1 ? "session" : "sessions"} this week` : undefined,
    });
  }

  const done = src.habitEntries.filter((e) => e.status === "done");
  rows.push({
    key: "habits",
    label: "Habit check-ins",
    href: "/habits",
    thisWeek: count(done, thisWeek, (e) => dayOf(e.day)),
    lastWeek: count(done, lastWeek, (e) => dayOf(e.day)),
    unit: "count",
  });

  rows.push({
    key: "bookmarks",
    label: "Bookmarks saved",
    href: "/",
    thisWeek: count(src.bookmarks, thisWeek, (b) => dayOf(b.createdAt)),
    lastWeek: count(src.bookmarks, lastWeek, (b) => dayOf(b.createdAt)),
    unit: "count",
  });

  rows.push({
    key: "notes-written",
    label: "Notes written",
    href: "/notes",
    thisWeek: count(src.notes, thisWeek, (n) => dayOf(n.createdAt)),
    lastWeek: count(src.notes, lastWeek, (n) => dayOf(n.createdAt)),
    unit: "count",
  });

  // Last edited in the week but written before it: a note can only be counted
  // once, by its latest edit, so last week's figure undercounts notes edited
  // again since. Said in the row's detail rather than hidden.
  const editedOnly = (w: RecapWeek) =>
    count(src.notes, w, (n) => {
      const edited = dayOf(n.updatedAt);
      const created = dayOf(n.createdAt);
      return edited && created && created < w.start ? edited : null;
    });
  rows.push({
    key: "notes-edited",
    label: "Older notes edited",
    href: "/notes",
    thisWeek: editedOnly(thisWeek),
    lastWeek: editedOnly(lastWeek),
    unit: "count",
    detail: "Counted by each note's latest edit",
  });

  rows.push({
    key: "items",
    label: "Items added to My Stuff",
    href: "/inventory",
    thisWeek: count(src.items, thisWeek, (i) => dayOf(i.createdAt)),
    lastWeek: count(src.items, lastWeek, (i) => dayOf(i.createdAt)),
    unit: "count",
  });

  return rows.filter((r) => r.thisWeek > 0 || r.lastWeek > 0);
}

/** "3h 05m", "45m", "0m". */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}
