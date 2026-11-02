import { describe, expect, it } from "vitest";

import {
  AppleHealthReader,
  coerceHealthLink,
  mergeDaily,
  parseAppleHealthXml,
  parseHealthCsv,
  planHealthEntries,
  suggestLink,
  summarize,
  unionMinutes,
  type DailyHealth,
} from "@/features/habits/lib/healthImport";
import type { Habit } from "@/features/habits/lib/types";

const rec = (type: string, start: string, end: string, value: string, source = "iPhone") =>
  `<Record type="${type}" sourceName="${source}" unit="count" creationDate="${start}" startDate="${start}" endDate="${end}" value="${value}"/>`;
const STEPS = "HKQuantityTypeIdentifierStepCount";
const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";
const ASLEEP = "HKCategoryValueSleepAnalysisAsleepCore";
const wrap = (...records: string[]) => `<?xml version="1.0"?><HealthData>${records.join("\n")}</HealthData>`;

describe("Apple Health XML", () => {
  it("sums steps per day and per source, and takes the larger source — never the sum of two", () => {
    const phone = (start: string, end: string, v: string) => rec(STEPS, start, end, v, "Rob&apos;s iPhone");
    const xml = wrap(
      phone("2026-03-05 08:00:00 -0500", "2026-03-05 08:10:00 -0500", "3000"),
      phone("2026-03-05 09:00:00 -0500", "2026-03-05 09:10:00 -0500", "2500"),
      // The watch counted the same walk: 5200 for the day, which is the phone's 5500 less a little.
      rec(STEPS, "2026-03-05 08:00:00 -0500", "2026-03-05 09:10:00 -0500", "5200", "Apple Watch")
    );
    // Phone 3000 + 2500 = 5500 beats the watch's 5200; adding all three would say 10700.
    expect(parseAppleHealthXml(xml).get("2026-03-05")?.steps).toBe(5500);
  });

  it("files a record under the day written in its timestamp, whatever the zone", () => {
    const xml = wrap(rec(STEPS, "2026-03-05 23:50:00 -0800", "2026-03-06 00:05:00 -0800", "400"));
    const d = parseAppleHealthXml(xml);
    expect(d.get("2026-03-05")?.steps).toBe(400);
    expect(d.has("2026-03-06")).toBe(false);
  });

  it("totals exercise minutes, converting seconds", () => {
    const xml = wrap(
      rec("HKQuantityTypeIdentifierAppleExerciseTime", "2026-03-05 07:00:00 +0000", "2026-03-05 07:30:00 +0000", "30").replace('unit="count"', 'unit="min"'),
      rec("HKQuantityTypeIdentifierAppleExerciseTime", "2026-03-06 07:00:00 +0000", "2026-03-06 07:30:00 +0000", "1800").replace('unit="count"', 'unit="s"')
    );
    const d = parseAppleHealthXml(xml);
    expect(d.get("2026-03-05")?.exerciseMin).toBe(30);
    expect(d.get("2026-03-06")?.exerciseMin).toBe(30);
  });

  it("counts a night's sleep once, on the day you woke up, ignoring in-bed time and overlaps", () => {
    const xml = wrap(
      // 23:00 → 02:00 core, 02:00 → 06:30 core; a watch and a phone both claim 01:00 → 03:00.
      rec(SLEEP, "2026-03-04 23:00:00 -0500", "2026-03-05 02:00:00 -0500", ASLEEP),
      rec(SLEEP, "2026-03-05 02:00:00 -0500", "2026-03-05 06:30:00 -0500", ASLEEP),
      rec(SLEEP, "2026-03-05 01:00:00 -0500", "2026-03-05 03:00:00 -0500", "HKCategoryValueSleepAnalysisAsleepREM"),
      rec(SLEEP, "2026-03-04 22:30:00 -0500", "2026-03-05 06:45:00 -0500", "HKCategoryValueSleepAnalysisInBed")
    );
    const d = parseAppleHealthXml(xml);
    // 23:00 → 06:30 = 7.5 h, the overlap and the in-bed record not added.
    expect(d.get("2026-03-05")?.sleepHours).toBe(7.5);
    expect(d.has("2026-03-04")).toBe(false);
  });

  it("totals mindful minutes without double counting", () => {
    const xml = wrap(
      rec("HKCategoryTypeIdentifierMindfulSession", "2026-03-05 07:00:00 +0000", "2026-03-05 07:10:00 +0000", "HKCategoryValueNotApplicable"),
      rec("HKCategoryTypeIdentifierMindfulSession", "2026-03-05 07:05:00 +0000", "2026-03-05 07:15:00 +0000", "HKCategoryValueNotApplicable")
    );
    expect(parseAppleHealthXml(xml).get("2026-03-05")?.mindfulMin).toBe(15);
  });

  it("ignores other record types and reads records that carry a child element", () => {
    const xml =
      `<HealthData><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="W" startDate="2026-03-05 08:00:00 +0000" endDate="2026-03-05 08:00:00 +0000" value="70"/>` +
      `<Record type="${STEPS}" sourceName="W" startDate="2026-03-05 08:00:00 +0000" endDate="2026-03-05 08:10:00 +0000" value="100">` +
      `<MetadataEntry key="k" value="v"/></Record></HealthData>`;
    const d = parseAppleHealthXml(xml);
    expect([...d.keys()]).toEqual(["2026-03-05"]);
    expect(d.get("2026-03-05")?.steps).toBe(100);
  });

  it("reads the same result however the file is cut into chunks", () => {
    const xml = wrap(
      rec(STEPS, "2026-03-05 08:00:00 -0500", "2026-03-05 08:10:00 -0500", "3000"),
      rec(SLEEP, "2026-03-04 23:00:00 -0500", "2026-03-05 06:00:00 -0500", ASLEEP),
      rec(STEPS, "2026-03-06 08:00:00 -0500", "2026-03-06 08:10:00 -0500", "4000")
    );
    const whole = parseAppleHealthXml(xml);
    for (const size of [1, 2, 3, 7, 13, 50]) {
      const r = new AppleHealthReader();
      for (let i = 0; i < xml.length; i += size) r.push(xml.slice(i, i + size));
      expect([...r.result()]).toEqual([...whole]);
    }
  });

  it("unescapes names and ignores unreadable values", () => {
    const xml = wrap(
      rec(STEPS, "2026-03-05 08:00:00 -0500", "2026-03-05 08:10:00 -0500", "abc"),
      rec(STEPS, "bad date", "bad date", "10")
    );
    expect(parseAppleHealthXml(xml).size).toBe(0);
  });
});

describe("unionMinutes", () => {
  const min = (m: number) => m * 60000;
  it("merges overlaps, keeps gaps and tolerates nothing", () => {
    expect(unionMinutes([])).toBe(0);
    expect(unionMinutes([[0, min(10)], [min(5), min(15)]])).toBe(15);
    expect(unionMinutes([[0, min(10)], [min(20), min(30)]])).toBe(20);
    expect(unionMinutes([[min(5), min(8)], [0, min(10)]])).toBe(10); // contained
    expect(unionMinutes([[min(10), min(10)], [min(9), min(5)]])).toBe(0); // empty / backwards
  });
});

describe("CSV", () => {
  it("reads Google Fit's daily summary by header name", () => {
    const csv = "Date,Move Minutes count,Calories (kcal),Distance (m),Step count\n2026-03-05,42,1900,5100,7312\n2026-03-06,0,1800,200,410\n";
    const d = parseHealthCsv(csv)!;
    expect(d.get("2026-03-05")).toEqual({ exerciseMin: 42, steps: 7312 });
    expect(d.get("2026-03-06")).toEqual({ exerciseMin: 0, steps: 410 });
  });

  it("sums a per-day interval file, taking the day from the start time", () => {
    const csv =
      "Start time,End time,Move Minutes count,Step count\n" +
      "2026-03-05T00:00:00.000-05:00,2026-03-05T00:15:00.000-05:00,5,100\n" +
      "2026-03-05T00:15:00.000-05:00,2026-03-05T00:30:00.000-05:00,10,250\n";
    expect(parseHealthCsv(csv)!.get("2026-03-05")).toEqual({ exerciseMin: 15, steps: 350 });
  });

  it("reads a hand-made CSV, keeps sleep's decimal, and skips junk rows and blank cells", () => {
    const csv = "date,steps,sleep hours,mindful minutes\n2026-03-05,9000,7.46,\nnot a date,1,1,1\n2026-03-06,,6.2,12\n";
    const d = parseHealthCsv(csv)!;
    expect(d.get("2026-03-05")).toEqual({ steps: 9000, sleepHours: 7.5 });
    expect(d.get("2026-03-06")).toEqual({ sleepHours: 6.2, mindfulMin: 12 });
    expect(d.size).toBe(2);
  });

  it("returns null when it can't find a date column and a metric", () => {
    expect(parseHealthCsv("")).toBeNull();
    expect(parseHealthCsv("name,value\na,1\n")).toBeNull();
    expect(parseHealthCsv("date,calories\n2026-03-05,100\n")).toBeNull();
    expect(parseHealthCsv("date,steps\nnope,1\n")).toBeNull();
  });
});

describe("mergeDaily / summarize", () => {
  const day = (o: object): DailyHealth => new Map(Object.entries(o)) as DailyHealth;

  it("takes the larger value where files overlap, rather than counting a day twice", () => {
    const a = day({ "2026-03-05": { steps: 5000 } });
    const b = day({ "2026-03-05": { steps: 5200, exerciseMin: 20 }, "2026-03-06": { steps: 1 } });
    const m = mergeDaily([a, b]);
    expect(m.get("2026-03-05")).toEqual({ steps: 5200, exerciseMin: 20 });
    expect(m.size).toBe(2);
  });

  it("summarises the span and how many days carry each metric", () => {
    const s = summarize(day({ "2026-03-05": { steps: 1 }, "2026-03-09": { steps: 1, sleepHours: 7 }, "2026-03-07": {} }));
    expect(s).toEqual({
      first: "2026-03-05",
      last: "2026-03-09",
      days: { steps: 2, exerciseMin: 0, sleepHours: 1, mindfulMin: 0 },
    });
    expect(summarize(new Map())).toMatchObject({ first: null, last: null });
  });
});

describe("suggestLink", () => {
  it.each([
    ["Walk 8000 steps", "binary", "steps"],
    ["Move my body", "binary", "exerciseMin"],
    ["Gym", "binary", "exerciseMin"],
    ["Sleep by 11pm", "binary", "sleepHours"],
    ["Meditate", "binary", "mindfulMin"],
    ["Read", "binary", null],
  ])("%s (%s) → %s", (name, type, metric) => {
    expect(suggestLink({ name, type: type as Habit["type"] })?.metric ?? null).toBe(metric);
  });

  it("offers no sleep link to a measurable habit (a count is a whole number)", () => {
    expect(suggestLink({ name: "Sleep", type: "measurable" })).toBeNull();
  });
});

describe("planHealthEntries", () => {
  const NOW = "2026-03-10T12:00:00.000Z";
  const daily: DailyHealth = new Map([
    ["2026-03-01", { steps: 9000, exerciseMin: 10 }],
    ["2026-03-02", { steps: 7000, exerciseMin: 45 }],
    ["2026-03-03", { steps: 8000 }],
    ["2026-03-04", { exerciseMin: 50 }],
  ]);
  const range = { from: "2026-03-01", to: "2026-03-10" };
  const bin = (id: string, link?: Habit["healthLink"]) => ({ id, type: "binary" as const, healthLink: link });

  it("marks a binary habit done on the days the metric reaches its bar — and only those", () => {
    const plan = planHealthEntries([bin("h", { metric: "steps", threshold: 8000 })], daily, new Set(), range, NOW);
    expect(plan.entries.map((e) => e.day)).toEqual(["2026-03-01", "2026-03-03"]);
    expect(plan.entries[0]).toEqual({
      id: "h_2026-03-01",
      habitId: "h",
      day: "2026-03-01",
      status: "done",
      count: 1,
      createdAt: NOW,
    });
  });

  it("gives a measurable habit the day's value as its count", () => {
    const plan = planHealthEntries(
      [{ id: "m", type: "measurable", healthLink: { metric: "steps", threshold: 0 } }],
      daily,
      new Set(),
      range,
      NOW
    );
    expect(plan.entries.map((e) => [e.day, e.count])).toEqual([
      ["2026-03-01", 9000],
      ["2026-03-02", 7000],
      ["2026-03-03", 8000],
    ]);
  });

  it("never touches a day already logged — done or skipped — and says how many it left", () => {
    const plan = planHealthEntries(
      [bin("h", { metric: "steps", threshold: 8000 })],
      daily,
      new Set(["h_2026-03-01"]),
      range,
      NOW
    );
    expect(plan.entries.map((e) => e.day)).toEqual(["2026-03-03"]);
    expect(plan.perHabit).toEqual([{ habitId: "h", add: 1, alreadyLogged: 1 }]);
  });

  it("keeps to the chosen date range", () => {
    const plan = planHealthEntries(
      [bin("h", { metric: "exerciseMin", threshold: 30 })],
      daily,
      new Set(),
      { from: "2026-03-03", to: "2026-03-10" },
      NOW
    );
    expect(plan.entries.map((e) => e.day)).toEqual(["2026-03-04"]);
  });

  it("skips habits with no link, and a day without that metric", () => {
    const plan = planHealthEntries([bin("none"), bin("s", { metric: "sleepHours", threshold: 7 })], daily, new Set(), range, NOW);
    expect(plan.entries).toEqual([]);
    expect(plan.perHabit).toEqual([{ habitId: "s", add: 0, alreadyLogged: 0 }]);
  });

  it("plans a rerun as nothing once the first has been applied", () => {
    const habits = [bin("h", { metric: "steps", threshold: 8000 })];
    const first = planHealthEntries(habits, daily, new Set(), range, NOW);
    const again = planHealthEntries(habits, daily, new Set(first.entries.map((e) => e.id)), range, NOW);
    expect(again.entries).toEqual([]);
  });
});

describe("coerceHealthLink", () => {
  it("accepts a real link and drops everything else", () => {
    expect(coerceHealthLink({ metric: "steps", threshold: 8000 })).toEqual({ metric: "steps", threshold: 8000 });
    expect(coerceHealthLink({ metric: "steps", threshold: "7500" })).toEqual({ metric: "steps", threshold: 7500 });
    for (const bad of [null, "x", {}, { metric: "heartRate", threshold: 1 }, { metric: "steps", threshold: -1 }, { metric: "steps" }]) {
      expect(coerceHealthLink(bad)).toBeUndefined();
    }
  });
});
