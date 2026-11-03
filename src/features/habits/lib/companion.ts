// The habit companion: a small plant that grows with the check-ins you've made and
// keeps you company today. Everything here is DERIVED from entries you already
// have — nothing about the plant is stored except its name and whether you've
// hidden it — so it can't drift from your history, and it only ever grows (done
// check-ins are only ever added).
//
// Deliberately gentle. It never wilts, never loses what it has grown, never
// counts missed days against you and has no points: after a long gap the mood is
// "welcome back", not a penalty. Pure — see companion.test.ts.

export type Stage = { at: number; name: string };

/** Done check-ins needed to reach each stage. */
export const STAGES: Stage[] = [
  { at: 0, name: "Seed" },
  { at: 1, name: "Sprout" },
  { at: 7, name: "Seedling" },
  { at: 30, name: "Young plant" },
  { at: 90, name: "In leaf" },
  { at: 200, name: "In bloom" },
  { at: 500, name: "Old tree" },
];

export type Mood = "resting" | "waiting" | "glad" | "radiant" | "welcome";

export type CompanionInput = {
  /** Every "done" check-in ever, across all habits (deleted habits' history counts). */
  checkins: number;
  dueToday: number;
  doneToday: number;
  /** The most recent day with a done check-in, or null if none. */
  lastDoneDay: string | null;
  today: string;
  name: string;
};

export type CompanionState = {
  stage: number; // index into STAGES
  stageName: string;
  /** Check-ins until the next stage, or null at the last one. */
  toNext: number | null;
  /** 0..1 of the way from this stage to the next (1 at the last). */
  growth: number;
  mood: Mood;
  line: string;
};

export const DEFAULT_NAME = "Sprout";
export const MAX_NAME_CHARS = 20;
/** A gap of this many days without a check-in reads as "welcome back". */
export const WELCOME_BACK_DAYS = 3;

export function cleanName(raw: string): string {
  const flat = raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_CHARS).trim();
  return flat || DEFAULT_NAME;
}

/** Whole days from `a` to `b` (both bare local `YYYY-MM-DD`): label arithmetic, no instant involved. */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

export function stageFor(checkins: number): number {
  let idx = 0;
  STAGES.forEach((s, i) => {
    if (checkins >= s.at) idx = i;
  });
  return idx;
}

const LINES: Record<Mood, string[]> = {
  radiant: [
    "{name} is soaking it all in. Everything for today is done.",
    "A good day for {name}. Rest now.",
    "{name} leans toward the light — you showed up for all of it.",
  ],
  glad: [
    "{name} noticed. One at a time is plenty.",
    "{name} is doing well on today’s small steps.",
    "Good — {name} likes this pace.",
  ],
  waiting: [
    "{name} is here whenever you are.",
    "Nothing to rush. {name} will keep you company.",
    "A small first step would make {name}’s day.",
  ],
  welcome: [
    "Welcome back. {name} kept your place.",
    "{name} is just glad to see you.",
    "No catching up needed — {name} grows from today on.",
  ],
  resting: [
    "A quiet day: nothing is scheduled. {name} is resting.",
    "{name} is having a slow one — you can too.",
    "Nothing due today. {name} says: enjoy it.",
  ],
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function moodFor(i: Pick<CompanionInput, "dueToday" | "doneToday" | "lastDoneDay" | "today">): Mood {
  if (i.dueToday > 0 && i.doneToday >= i.dueToday) return "radiant";
  if (i.doneToday > 0) return "glad";
  if (i.dueToday === 0) return "resting";
  if (i.lastDoneDay && daysBetween(i.lastDoneDay, i.today) >= WELCOME_BACK_DAYS) return "welcome";
  return "waiting";
}

export function companionState(input: CompanionInput): CompanionState {
  const stage = stageFor(input.checkins);
  const next = STAGES[stage + 1];
  const here = STAGES[stage].at;
  const mood = moodFor(input);
  const options = LINES[mood];
  // One line a day, stable across renders: a calm companion, not a slot machine.
  const template = options[hash(`${input.today}:${mood}`) % options.length];
  return {
    stage,
    stageName: STAGES[stage].name,
    toNext: next ? next.at - input.checkins : null,
    growth: next ? Math.min(1, (input.checkins - here) / (next.at - here)) : 1,
    mood,
    line: template.replaceAll("{name}", input.name),
  };
}

/** The companion's two stored preferences, read defensively from storage. */
export type CompanionPrefs = { name: string; hidden: boolean };

export function readPrefs(raw: string | null): CompanionPrefs {
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return {
      name: typeof parsed.name === "string" ? cleanName(parsed.name) : DEFAULT_NAME,
      hidden: parsed.hidden === true,
    };
  } catch {
    return { name: DEFAULT_NAME, hidden: false };
  }
}
