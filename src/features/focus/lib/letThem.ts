// "Let them" reset — content bank + pure helpers. Framework-free so the data
// layer, hook, and tests can import it. The idea (release what you can't control,
// then refocus on what you can) is a plain-language take on a dichotomy-of-control
// reframe; the wording here is original.

export type ResetTrigger = {
  id: string;
  label: string;
  /** The "Let them" reframe shown for this trigger. */
  reframe: string;
};

export const RESET_TRIGGERS: readonly ResetTrigger[] = [
  { id: "coworker", label: "A coworker's choices", reframe: "Let them work their way. Their method isn't a verdict on yours." },
  { id: "comparison", label: "Comparison", reframe: "Let them have their highlight reel. Your path is your own." },
  { id: "criticism", label: "Criticism", reframe: "Let them have their opinion. It's information, not a sentence." },
  { id: "mood", label: "Someone's mood", reframe: "Let them feel what they feel. Their mood isn't yours to fix." },
  { id: "fomo", label: "FOMO", reframe: "Let them go ahead. Being everywhere isn't the same as being where you matter." },
  { id: "delay", label: "A delay", reframe: "Let it take the time it takes. Rushing it won't move it faster." },
  { id: "decision", label: "A decision that isn't mine", reframe: "Let them decide. Your peace doesn't hinge on the outcome." },
  { id: "left-out", label: "Being left out", reframe: "Let them gather without you. The right rooms make space for you." },
  { id: "advice", label: "Unsolicited advice", reframe: "Let them advise. You still get to choose." },
  { id: "slow-reply", label: "Slow replies", reframe: "Let them reply on their clock. Their pace isn't a message about you." },
];

const GENERIC_REFRAME = "Let them. You can't control this — and you don't have to.";

/** The reframe for a trigger label or id; a gentle generic line if unmatched. */
export function getReframe(trigger: string): string {
  const t = trigger.trim().toLowerCase();
  if (!t) return GENERIC_REFRAME;
  const hit = RESET_TRIGGERS.find(
    (r) => r.label.toLowerCase() === t || r.id === t
  );
  return hit?.reframe ?? GENERIC_REFRAME;
}

/* ------------------------------------------------------------- streak --- */

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Number of resets logged on a given day. */
export function countOnDay(
  resets: readonly { day: string }[],
  day: string
): number {
  return resets.reduce((n, r) => (r.day === day ? n + 1 : n), 0);
}

/**
 * Current reset streak: consecutive days (ending today, or yesterday if today
 * has none yet) that have at least one reset. Today-with-none keeps a live
 * streak intact rather than reading it as broken.
 */
export function resetStreak(
  resets: readonly { day: string }[],
  todayKey: string
): number {
  const days = new Set(resets.map((r) => r.day).filter(Boolean));
  if (days.size === 0) return 0;
  let cur = parseDayKey(todayKey);
  if (!days.has(localDayKey(cur))) {
    cur = new Date(cur);
    cur.setDate(cur.getDate() - 1);
  }
  let streak = 0;
  while (days.has(localDayKey(cur))) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}
