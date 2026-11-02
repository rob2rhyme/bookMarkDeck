// Health-data import for habits: read a day-by-day summary out of an Apple Health
// export or a Google Fit / generic CSV, then turn it into habit entries. Pure — no
// DOM, no storage — so every rule here is unit-tested (healthImport.test.ts).
//
// The health data is only ever READ to decide which days a habit was done. It is
// never stored: the result is ordinary habit entries, and the numbers are dropped.
//
// Sources, and what each can honestly give:
//   • Apple Health `export.xml` — steps, exercise minutes, sleep, mindful minutes.
//     Phone and watch both record steps, so a day's steps are the larger of the
//     per-source totals rather than their sum (a sum counts every step twice).
//   • Google Fit (Takeout) and generic CSVs — columns are found by NAME.

import { parseCsv } from "@/utils/parseCsv";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

export type HealthMetric = "steps" | "exerciseMin" | "sleepHours" | "mindfulMin";

export const METRICS: { id: HealthMetric; label: string; unit: string; fits: Habit["type"][] }[] = [
  { id: "steps", label: "Steps", unit: "steps", fits: ["binary", "measurable"] },
  { id: "exerciseMin", label: "Exercise minutes", unit: "min", fits: ["binary", "measurable"] },
  { id: "mindfulMin", label: "Mindful minutes", unit: "min", fits: ["binary", "measurable"] },
  // Whole numbers only for a measurable habit's count, and 7.5 h would round to 8.
  { id: "sleepHours", label: "Sleep (hours)", unit: "h", fits: ["binary"] },
];

/** Which habits a metric can be linked to; stored on the habit so the next import remembers it. */
export type HealthLink = { metric: HealthMetric; threshold: number };

export type DayHealth = Partial<Record<HealthMetric, number>>;
export type DailyHealth = Map<string, DayHealth>; // local YYYY-MM-DD → what was recorded

// The calendar day written at the start of a timestamp, read as text — not an instant to format.
const DAY_AT_START = /^(\d{4}-\d{2}-\d{2})(?![\d])/;

/* ------------------------------------------------------------- Apple Health --- */

const STEPS = "HKQuantityTypeIdentifierStepCount";
const EXERCISE = "HKQuantityTypeIdentifierAppleExerciseTime";
const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";
const MINDFUL = "HKCategoryTypeIdentifierMindfulSession";
// Every "asleep" stage; "InBed" and "Awake" are not sleep.
const ASLEEP = /HKCategoryValueSleepAnalysisAsleep/;

const RECORD_RE = /<Record\b([^>]*)>/g;
const ATTR_RE = /([A-Za-z]+)="([^"]*)"/g;

const unescapeXml = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** "2024-03-05 07:12:03 -0500" → epoch ms (the offset is honoured), or null. */
function appleInstant(s: string | undefined): number | null {
  const m = s?.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
  return Number.isNaN(t) ? null : t;
}

/** The calendar day written in an Apple timestamp, in the zone it was recorded in. */
const appleDay = (s: string | undefined): string | null => s?.match(DAY_AT_START)?.[1] ?? null;

/** Total minutes covered by a set of [start, end] intervals — overlaps counted once. */
export function unionMinutes(intervals: [number, number][]): number {
  const sorted = [...intervals].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = 0;
  let curEnd = -Infinity;
  for (const [a, b] of sorted) {
    if (a > curEnd) {
      if (curEnd > -Infinity) total += curEnd - curStart;
      curStart = a;
      curEnd = b;
    } else if (b > curEnd) {
      curEnd = b;
    }
  }
  if (curEnd > -Infinity) total += curEnd - curStart;
  return total / 60000;
}

/**
 * Streaming reader for an Apple Health `export.xml`, which can be gigabytes: feed
 * it text in chunks (a tag may be split across two), then call `result()`.
 */
export class AppleHealthReader {
  private tail = "";
  // day → source → total, for the summed quantities.
  private steps = new Map<string, Map<string, number>>();
  private exercise = new Map<string, Map<string, number>>();
  // wake-up day → intervals, for the overlapping ones.
  private sleep = new Map<string, [number, number][]>();
  private mindful = new Map<string, [number, number][]>();

  push(chunk: string): void {
    const text = this.tail + chunk;
    // Process up to the last complete tag; carry the rest into the next chunk.
    const cut = text.lastIndexOf(">");
    if (cut < 0) {
      this.tail = text;
      return;
    }
    this.tail = text.slice(cut + 1);
    for (const m of text.slice(0, cut + 1).matchAll(RECORD_RE)) {
      const attrs = m[1];
      // Cheap filter first: most records are heart rate, energy, distance…
      if (
        !attrs.includes(STEPS) &&
        !attrs.includes(EXERCISE) &&
        !attrs.includes(SLEEP) &&
        !attrs.includes(MINDFUL)
      ) {
        continue;
      }
      const a: Record<string, string> = {};
      for (const kv of attrs.matchAll(ATTR_RE)) a[kv[1]] = unescapeXml(kv[2]);
      this.record(a);
    }
  }

  private add(into: Map<string, Map<string, number>>, day: string | null, source: string, n: number) {
    if (!day || !Number.isFinite(n) || n < 0) return;
    const perSource = into.get(day) ?? new Map<string, number>();
    perSource.set(source, (perSource.get(source) ?? 0) + n);
    into.set(day, perSource);
  }

  private interval(into: Map<string, [number, number][]>, a: Record<string, string>) {
    const start = appleInstant(a.startDate);
    const end = appleInstant(a.endDate);
    // A night belongs to the day you woke up.
    const day = appleDay(a.endDate);
    if (start === null || end === null || !day) return;
    const list = into.get(day) ?? [];
    list.push([start, end]);
    into.set(day, list);
  }

  private record(a: Record<string, string>) {
    const source = a.sourceName ?? "";
    switch (a.type) {
      case STEPS:
        this.add(this.steps, appleDay(a.startDate), source, Number(a.value));
        break;
      case EXERCISE: {
        const v = Number(a.value);
        // Exercise time is recorded in minutes; convert if a file says otherwise.
        this.add(this.exercise, appleDay(a.startDate), source, a.unit === "s" ? v / 60 : v);
        break;
      }
      case SLEEP:
        if (a.value && ASLEEP.test(a.value)) this.interval(this.sleep, a);
        break;
      case MINDFUL:
        this.interval(this.mindful, a);
        break;
    }
  }

  result(): DailyHealth {
    const out: DailyHealth = new Map();
    const day = (d: string) => {
      const cur = out.get(d) ?? {};
      out.set(d, cur);
      return cur;
    };
    // The larger source, not the sum: phone and watch both count the same walk.
    const biggest = (m: Map<string, number>) => Math.max(...m.values());
    for (const [d, per] of this.steps) day(d).steps = Math.round(biggest(per));
    for (const [d, per] of this.exercise) day(d).exerciseMin = Math.round(biggest(per));
    for (const [d, list] of this.sleep) {
      const hours = unionMinutes(list) / 60;
      if (hours > 0) day(d).sleepHours = Math.round(hours * 10) / 10;
    }
    for (const [d, list] of this.mindful) {
      const min = unionMinutes(list);
      if (min > 0) day(d).mindfulMin = Math.round(min);
    }
    return out;
  }
}

/** Convenience for tests and small files: parse a whole `export.xml` string. */
export function parseAppleHealthXml(xml: string): DailyHealth {
  const r = new AppleHealthReader();
  r.push(xml);
  return r.result();
}

/* ---------------------------------------------------------------------- CSV --- */

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Header text (normalised) → metric, per source. Google Fit's Takeout uses
// "Step count" and "Move Minutes count"; the plain names are for hand-made CSVs.
const CSV_METRIC: Record<string, HealthMetric> = {
  steps: "steps",
  "step count": "steps",
  "exercise minutes": "exerciseMin",
  "exercise min": "exerciseMin",
  exercise: "exerciseMin",
  "move minutes count": "exerciseMin",
  "move minutes": "exerciseMin",
  "sleep hours": "sleepHours",
  sleep: "sleepHours",
  "mindful minutes": "mindfulMin",
  mindful: "mindfulMin",
  meditation: "mindfulMin",
};

/** A CSV's rows → days, or null if it has no recognisable date and metric columns. */
export function parseHealthCsv(text: string): DailyHealth | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const header = rows[0].map(norm);
  const dateCol = header.findIndex((h) => h === "date" || h === "day");
  // Google's per-day files have no Date column, only the interval's start.
  const startCol = dateCol < 0 ? header.findIndex((h) => h === "start time") : -1;
  const whenCol = dateCol >= 0 ? dateCol : startCol;
  if (whenCol < 0) return null;

  const metricCols: [number, HealthMetric][] = [];
  header.forEach((h, i) => {
    const m = CSV_METRIC[h];
    if (m && !metricCols.some(([, x]) => x === m)) metricCols.push([i, m]);
  });
  if (metricCols.length === 0) return null;

  const out: DailyHealth = new Map();
  for (const row of rows.slice(1)) {
    const day = (row[whenCol] ?? "").trim().match(DAY_AT_START)?.[1];
    if (!day) continue;
    const cur = out.get(day) ?? {};
    for (const [i, metric] of metricCols) {
      const n = Number((row[i] ?? "").trim());
      if (!Number.isFinite(n) || n < 0 || (row[i] ?? "").trim() === "") continue;
      // Rows within one file are pieces of the same day (intervals); add them.
      cur[metric] = (cur[metric] ?? 0) + n;
    }
    if (Object.keys(cur).length) out.set(day, cur);
  }
  if (out.size === 0) return null;
  // Whole numbers for counts; sleep keeps a decimal.
  for (const cur of out.values()) {
    for (const k of Object.keys(cur) as HealthMetric[]) {
      cur[k] = k === "sleepHours" ? Math.round(cur[k]! * 10) / 10 : Math.round(cur[k]!);
    }
  }
  return out;
}

/**
 * Combine several files' days. Where two files give the same day and metric the
 * LARGER wins, not the sum: an aggregate file beside per-day files would
 * otherwise count every day twice.
 */
export function mergeDaily(parts: DailyHealth[]): DailyHealth {
  const out: DailyHealth = new Map();
  for (const part of parts) {
    for (const [day, metrics] of part) {
      const cur = out.get(day) ?? {};
      for (const k of Object.keys(metrics) as HealthMetric[]) {
        cur[k] = Math.max(cur[k] ?? 0, metrics[k]!);
      }
      out.set(day, cur);
    }
  }
  return out;
}

/** First and last day with data, and how many days carry each metric — for the preview. */
export function summarize(daily: DailyHealth): {
  first: string | null;
  last: string | null;
  days: Record<HealthMetric, number>;
} {
  const days: Record<HealthMetric, number> = { steps: 0, exerciseMin: 0, sleepHours: 0, mindfulMin: 0 };
  let first: string | null = null;
  let last: string | null = null;
  for (const [day, m] of daily) {
    let any = false;
    for (const k of Object.keys(days) as HealthMetric[]) {
      if (m[k] !== undefined) {
        days[k]++;
        any = true;
      }
    }
    if (!any) continue;
    if (first === null || day < first) first = day;
    if (last === null || day > last) last = day;
  }
  return { first, last, days };
}

/* ------------------------------------------------------------- applying it --- */

/** A sensible starting link for a habit, from its name and type — the user confirms it. */
export function suggestLink(habit: Pick<Habit, "name" | "type">): HealthLink | null {
  const n = habit.name.toLowerCase();
  const measurable = habit.type === "measurable";
  if (/\b(steps?|walk|walking)\b/.test(n)) return { metric: "steps", threshold: 8000 };
  if (/\b(sleep|bed ?time|rest)\b/.test(n) && !measurable) return { metric: "sleepHours", threshold: 7 };
  if (/\b(meditat\w*|mindful\w*|breath\w*)\b/.test(n)) return { metric: "mindfulMin", threshold: 5 };
  if (/\b(move|exercise|workout|run|running|gym|active|fitness|train\w*)\b/.test(n)) {
    return { metric: "exerciseMin", threshold: 30 };
  }
  return null;
}

export type HealthPlan = {
  entries: HabitEntry[];
  /** Per habit: days that will be marked, and days with data that were already logged. */
  perHabit: { habitId: string; add: number; alreadyLogged: number }[];
};

/**
 * The entries to create. A day already logged — done OR skipped — is left alone, so
 * an import can only add, never change or take back what you recorded yourself.
 *   binary: done on every day the metric reaches the threshold.
 *   measurable: the day's value becomes its count (any day with at least 1).
 */
export function planHealthEntries(
  habits: Pick<Habit, "id" | "type" | "healthLink">[],
  daily: DailyHealth,
  existingIds: Set<string>,
  range: { from: string; to: string },
  nowIso: string
): HealthPlan {
  const entries: HabitEntry[] = [];
  const perHabit: HealthPlan["perHabit"] = [];
  const days = [...daily.keys()].filter((d) => d >= range.from && d <= range.to).sort();

  for (const h of habits) {
    const link = h.healthLink;
    if (!link) continue;
    let add = 0;
    let alreadyLogged = 0;
    for (const day of days) {
      const value = daily.get(day)?.[link.metric];
      if (value === undefined) continue;
      let count: number;
      if (h.type === "measurable") {
        count = Math.round(value);
        if (count < 1) continue;
      } else {
        if (value < link.threshold) continue;
        count = 1;
      }
      const id = `${h.id}_${day}`;
      if (existingIds.has(id)) {
        alreadyLogged++;
        continue;
      }
      entries.push({ id, habitId: h.id, day, status: "done", count, createdAt: nowIso });
      add++;
    }
    perHabit.push({ habitId: h.id, add, alreadyLogged });
  }
  return { entries, perHabit };
}

/** A stored link from a backup or the cloud: a real metric and a sane threshold, or nothing. */
export function coerceHealthLink(raw: unknown): HealthLink | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const metric = METRICS.find((m) => m.id === r.metric)?.id;
  const threshold = typeof r.threshold === "number" ? r.threshold : Number(r.threshold);
  if (!metric || !Number.isFinite(threshold) || threshold < 0) return undefined;
  return { metric, threshold };
}
