// Trackable sources — the declarative bridge that lets a habit auto-sync from a
// Focus signal. Generalizes the original bespoke water↔hydration and
// journal↔notes links so adding a new auto-tracking habit is one registry entry
// (no new effect in useHabits, no new file).
//
// A habit binds to a source either explicitly (habit.linkedSourceId — set by
// templates, deterministic, user-controllable) or, for custom-named habits, by
// the source's strict `match` heuristic. The engine in useHabits subscribes to
// the bound source and applies `mergeStep` (pure, unit-tested) per snapshot.
//
// Merge policy keeps each link correct:
//   • bidirectional (hydration) — count moves both ways; first snapshot
//     max-merges, later snapshots adopt the remote, and a higher local value is
//     pushed back via `mirror`.
//   • raiseOnly (journal, meditation, focus) — the signal can only mark progress
//     up, never down. There's no forward write to persist a manual tap, so
//     auto-lowering would bounce it; raise-only avoids that.

import {
  saveHydration,
  subscribeHydration,
  subscribeMeditationSessions,
  subscribeNotes,
  subscribeResets,
  subscribeSessions,
} from "@/features/focus/data/focusData";
import { subscribeItems } from "@/features/inventory/data/inventoryData";
import { releasedOn } from "@/features/inventory/lib/declutter";
import {
  getFocusHydrationCache,
  isWaterHabit,
  setFocusHydrationCache,
} from "@/features/habits/lib/water";
import {
  focusHasJournalNote,
  isJournalHabit,
} from "@/features/habits/lib/journal";
import type { Habit, HabitType } from "@/features/habits/lib/types";

type Unsub = () => void;

export type SyncPolicy = "raiseOnly" | "bidirectional";

/** Context a forward `mirror` needs to write back to Focus. */
export type LinkCtx = {
  email: string | null | undefined;
  day: string;
  canSync: boolean;
};

export type TrackableSource = {
  id: string;
  label: string;
  /** Habit type this source can drive; "any" serves binary and measurable. */
  habitType: HabitType | "any";
  policy: SyncPolicy;
  /** Strict heuristic for SUGGESTING a link to a custom-named habit. */
  match: (h: Habit) => boolean;
  /** Live Focus value for `day` (count, or presence as 1/0); null = unknown. */
  subscribe: (
    email: string,
    day: string,
    cb: (value: number | null) => void
  ) => Unsub;
  /** Offline value from a local cache, or null when none exists. */
  readCache: (email: string | null | undefined, day: string) => number | null;
  /** Forward write (habit → Focus); omit for sources with no writable surface. */
  mirror?: (ctx: LinkCtx, value: number) => void;
};

const MIN_UNITS = ["min", "mins", "minute", "minutes"];
const isMinutes = (h: Habit) =>
  h.type === "measurable" && MIN_UNITS.includes((h.unit ?? "").trim().toLowerCase());
const text = (h: Habit) => `${h.name} ${h.identity ?? ""}`.toLowerCase();

export const TRACKABLE_SOURCES: readonly TrackableSource[] = [
  {
    id: "hydration",
    label: "Focus hydration",
    habitType: "measurable",
    policy: "bidirectional",
    match: isWaterHabit,
    subscribe: (email, day, cb) => subscribeHydration(email, day, cb),
    readCache: (email) => getFocusHydrationCache(email),
    mirror: ({ email, day, canSync }, value) => {
      setFocusHydrationCache(email, value);
      if (canSync && email) saveHydration(email, day, value).catch(() => {});
    },
  },
  {
    id: "journal",
    label: "Focus journal",
    habitType: "binary",
    policy: "raiseOnly",
    match: isJournalHabit,
    subscribe: (email, day, cb) =>
      subscribeNotes(email, (notes) =>
        cb(notes.some((n) => n.day === day) ? 1 : 0)
      ),
    readCache: (email, day) => {
      const has = focusHasJournalNote(email, day);
      return has == null ? null : has ? 1 : 0;
    },
  },
  {
    id: "meditation",
    label: "Meditation sessions",
    habitType: "any",
    policy: "raiseOnly",
    match: (h) =>
      (isMinutes(h) || h.type === "binary") &&
      /medit|mindful|breathe/.test(text(h)),
    subscribe: (email, day, cb) =>
      subscribeMeditationSessions(email, (rows) =>
        cb(rows.filter((r) => r.day === day).reduce((s, r) => s + r.minutes, 0))
      ),
    readCache: () => null,
  },
  {
    id: "focus",
    label: "Focus sessions",
    habitType: "any",
    policy: "raiseOnly",
    match: (h) =>
      (isMinutes(h) || h.type === "binary") &&
      /focus|deep[ -]?work|concentrat/.test(text(h)),
    subscribe: (email, day, cb) =>
      subscribeSessions(email, (rows) =>
        cb(rows.filter((r) => r.day === day).reduce((s, r) => s + r.focusMin, 0))
      ),
    readCache: () => null,
  },
  {
    id: "let-them-reset",
    label: "Focus resets",
    habitType: "any",
    policy: "raiseOnly",
    match: (h) => /reset|let them|let go|refocus|release/.test(text(h)),
    subscribe: (email, day, cb) =>
      subscribeResets(email, (rows) =>
        cb(rows.filter((r) => r.day === day).length)
      ),
    readCache: () => null,
  },
  {
    id: "declutter",
    label: "Items decluttered",
    habitType: "any",
    policy: "raiseOnly",
    match: (h) => /declutter|tidy|purge|donate|give ?away|minimalis/.test(text(h)),
    // Count how many inventory items were let go today (My Stuff → declutter).
    subscribe: (email, day, cb) =>
      subscribeItems(email, (items) => cb(releasedOn(items, day))),
    readCache: () => null,
  },
];

export function sourceById(id: string | null | undefined): TrackableSource | null {
  if (!id) return null;
  return TRACKABLE_SOURCES.find((s) => s.id === id) ?? null;
}

/** Sentinel `linkedSourceId` value meaning "the user explicitly turned sync
 *  off", so a heuristic match never silently re-links it. */
export const LINK_OPT_OUT = "none";

function typeFits(source: TrackableSource, habit: Habit): boolean {
  return source.habitType === "any" || source.habitType === habit.type;
}

/** The source a habit would bind to, ignoring an explicit opt-out — drives the
 *  "Link" affordance and the active resolution below. */
export function suggestSource(habit: Habit): TrackableSource | null {
  const explicit = sourceById(habit.linkedSourceId);
  if (explicit && typeFits(explicit, habit)) return explicit;
  return (
    TRACKABLE_SOURCES.find((s) => typeFits(s, habit) && s.match(habit)) ?? null
  );
}

/**
 * The source actually bound to a habit: none if the user opted out; otherwise an
 * explicit, type-compatible `linkedSourceId` wins, else the first heuristic
 * match. Returns null for habits that aren't auto-tracked.
 */
export function resolveSource(habit: Habit): TrackableSource | null {
  if (habit.linkedSourceId === LINK_OPT_OUT) return null;
  return suggestSource(habit);
}

export type MergeResult = {
  /** Set the today entry to "done" with this count, or null for no entry change. */
  set: number | null;
  /** Remove the today entry (bidirectional only, when the value falls to 0). */
  remove: boolean;
  /** Push this value back to Focus via the source's `mirror`, or null. */
  mirror: number | null;
};

const NOOP: MergeResult = { set: null, remove: false, mirror: null };

/**
 * Pure merge decision for one snapshot. `curCount` is the habit entry's current
 * done-count (0 if none); `remote` is the source value (null = unknown);
 * `isFirst` marks the first snapshot of a subscription (matters only for the
 * bidirectional max-merge + seed). Caller applies the result and flips isFirst.
 */
export function mergeStep(opts: {
  policy: SyncPolicy;
  habitType: HabitType;
  curCount: number;
  remote: number | null;
  target: number;
  isFirst: boolean;
}): MergeResult {
  const { policy, habitType, curCount, remote, target, isFirst } = opts;

  if (policy === "raiseOnly") {
    const val = remote == null ? 0 : remote;
    const desired = habitType === "binary" ? (val > 0 ? target : 0) : val;
    return desired > curCount ? { set: desired, remove: false, mirror: null } : NOOP;
  }

  // bidirectional
  if (remote == null) {
    // No Focus doc yet: seed it from the habit's count on the first snapshot.
    return { set: null, remove: false, mirror: isFirst && curCount > 0 ? curCount : null };
  }
  const resolved = isFirst ? Math.max(curCount, remote) : remote;
  const changed = resolved !== curCount;
  return {
    set: changed && resolved > 0 ? resolved : null,
    remove: changed && resolved <= 0,
    mirror: resolved !== remote ? resolved : null,
  };
}
