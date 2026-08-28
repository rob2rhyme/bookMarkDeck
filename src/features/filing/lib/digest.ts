// The one-line summary a push notification carries (ANALYSIS-FILING-LOG.md §6).
// Pure — see digest.test.ts.
//
// Why a DAILY DIGEST and not one push per obligation:
//
// The shipped push path (/api/push/schedule) clamps QStash delays to 24 hours,
// so a renewal three months out cannot be scheduled when you create it. Rather
// than build a second scheduler, a filing reminder is one message a day
// summarising everything that wants attention — re-armed each time you open the
// app. That fits the existing infrastructure exactly, and it is the better
// notification anyway: six papers due this week should be one line, not six
// buzzes.
//
// The consequence, stated plainly because it is a real limitation: if you do not
// open the app for more than a day, the digest stops until you do. The in-app
// panel and the nav badge are the reliable surface; push is a convenience on top.

import type { Bucket, DueItem } from "@/features/filing/lib/obligations";
import type { ShredItem } from "@/features/filing/lib/retention";
import type { CustodyItem } from "@/features/filing/lib/custody";

export type Digest = {
  title: string;
  body: string;
  /** Total things wanting attention — 0 means "send nothing". */
  count: number;
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** Join with commas and a final "and": "a, b and c". */
function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const isNow = (b: Bucket) => b === "overdue" || b === "week";

/**
 * Build the daily digest.
 *
 * The title states the most urgent fact, because on a locked phone that is often
 * all you see. The body names the specific papers when there are few enough to
 * be useful, and counts them when there aren't — a notification listing eleven
 * titles is a notification nobody reads.
 */
export function buildDigest(
  due: DueItem[],
  shred: ShredItem[],
  custody: CustodyItem[],
  maxNamed = 3
): Digest {
  const overdue = due.filter((d) => d.bucket === "overdue");
  const soon = due.filter((d) => isNow(d.bucket) && d.bucket !== "overdue");
  const late = custody.filter((c) => c.overdue);
  const count = due.length + shred.length + late.length;

  if (count === 0) return { title: "", body: "", count: 0 };

  const title =
    overdue.length > 0
      ? `${plural(overdue.length, "paper")} overdue`
      : soon.length > 0
        ? `${plural(soon.length, "paper")} due this week`
        : late.length > 0 && due.length === 0 && shred.length === 0
          ? `${plural(late.length, "folder")} not back yet`
          : "Filing needs a look";

  const parts: string[] = [];

  const named = [...overdue, ...soon].slice(0, maxNamed);
  if (named.length > 0) {
    const titles = named.map((d) => d.obligation.label || d.document.title);
    const rest = overdue.length + soon.length - named.length;
    // With a trailing "and N more", the names are comma-joined — otherwise the
    // line reads "A, B and C and 2 more", with the "and" doubled.
    parts.push(rest > 0 ? `${titles.join(", ")} and ${rest} more` : list(titles));
  } else if (due.length > 0) {
    parts.push(`${plural(due.length, "reminder")} coming up`);
  }

  if (shred.length > 0) parts.push(`${plural(shred.length, "paper")} ready to clear`);
  if (late.length > 0) parts.push(`${plural(late.length, "folder")} still out`);

  return { title, body: list(parts), count };
}

/**
 * Milliseconds until the next occurrence of `hour` local time. Always strictly
 * in the future: at exactly the hour, the next one is tomorrow, so re-arming
 * during the digest's own hour can't schedule a message in the past.
 */
export function msUntilHour(now: Date, hour: number): number {
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}
