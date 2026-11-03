// On-device reminders for dated things in My Stuff, for the native app shell.
//
// Web push can only be queued a day ahead (/api/push/schedule clamps to 24 h), so
// the web app sends one digest a day. A LOCAL notification has no such limit: in
// the native shell a warranty that ends in March can be scheduled in November, with
// no server and no network. This is the plan — which notifications, when, saying
// what — and is pure; `nativeReminders.ts` hands it to the device. See
// localReminders.test.ts.
//
// One reminder per dated event, at 9:00 local, a fixed lead before it. An event
// already inside its lead gets none here: the badge, the Attention panel and the
// daily digest cover it, and re-sending every time the app opens would be a nag.

import type { InventoryItem } from "@/features/inventory/lib/types";
import { effectiveUseBy, live, nextRenewal } from "@/features/inventory/lib/value";

export type LocalReminder = {
  /** Stable for the same item, kind and date, so a replan replaces rather than duplicates. */
  id: number;
  /** Epoch ms. */
  at: number;
  title: string;
  body: string;
};

export const REMINDER_HOUR = 9;
/** iOS keeps at most 64 pending local notifications; leave room for the timer alert. */
export const MAX_REMINDERS = 50;

type Kind = "warranty" | "useBy" | "renewal" | "maintenance" | "loan";

/** Days before the event to remind. */
const LEAD: Record<Kind, number> = { warranty: 14, useBy: 3, renewal: 3, maintenance: 1, loan: 0 };

const TITLE: Record<Kind, (lead: number) => string> = {
  warranty: () => "Warranty ending in 2 weeks",
  useBy: () => "Use by in 3 days",
  renewal: () => "Renews in 3 days",
  maintenance: () => "Upkeep due tomorrow",
  loan: () => "Due back today",
};

const parts = (day: string): [number, number, number] | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** 9:00 local on the day `lead` days before `day`, or null for a day that isn't one. */
function reminderMoment(day: string, lead: number): number | null {
  const p = parts(day);
  if (!p) return null;
  const at = new Date(p[0], p[1] - 1, p[2] - lead, REMINDER_HOUR, 0, 0, 0).getTime();
  return Number.isFinite(at) ? at : null;
}

/** FNV-1a, folded into a positive 31-bit int the native plugin accepts as an id. */
function hashId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 2_000_000_000) + 100_000; // clear of the timer alert's id (7001)
}

type Event = { item: InventoryItem; kind: Kind; day: string };

function eventsFor(item: InventoryItem, today: string): Event[] {
  const out: Event[] = [];
  if (item.warrantyExpiry) out.push({ item, kind: "warranty", day: item.warrantyExpiry });
  const useBy = effectiveUseBy(item);
  if (useBy) out.push({ item, kind: "useBy", day: useBy });
  const renews = nextRenewal(item, today);
  if (renews) out.push({ item, kind: "renewal", day: renews });
  if (item.maintenanceDate) out.push({ item, kind: "maintenance", day: item.maintenanceDate });
  if (item.lentTo?.trim() && item.dueDate) out.push({ item, kind: "loan", day: item.dueDate });
  return out;
}

/**
 * The reminders to have scheduled right now, soonest first, at most MAX_REMINDERS.
 * `nameItems` false (My Stuff is PIN-locked) keeps names — and who something is
 * lent to — out of a notification that shows on a locked phone.
 */
export function planLocalReminders(
  items: InventoryItem[],
  today: string,
  now: number,
  nameItems = true
): LocalReminder[] {
  const planned: LocalReminder[] = [];
  const taken = new Set<number>();
  for (const item of live(items)) {
    for (const ev of eventsFor(item, today)) {
      const lead = LEAD[ev.kind];
      const at = reminderMoment(ev.day, lead);
      if (at === null || at <= now) continue;

      let id = hashId(`${item.id}|${ev.kind}|${ev.day}`);
      while (taken.has(id)) id++; // a collision is astronomically rare; never share an id
      taken.add(id);

      const name = item.name.trim() || "Untitled item";
      const body = !nameItems
        ? "Open My Stuff to see which."
        : ev.kind === "loan"
          ? `${name} — lent to ${item.lentTo!.trim()}`
          : name;
      planned.push({ id, at, title: TITLE[ev.kind](lead), body });
    }
  }
  return planned.sort((a, b) => a.at - b.at || a.id - b.id).slice(0, MAX_REMINDERS);
}

/** What changed, to decide whether the device needs to be told anything. */
export function fingerprint(plan: LocalReminder[]): string {
  return plan.map((r) => `${r.id}@${r.at}:${r.title}:${r.body}`).join("|");
}
