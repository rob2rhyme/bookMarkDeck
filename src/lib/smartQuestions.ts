// "Ask your stuff" — a small set of useful questions answered by querying LOCAL
// data. No AI, no network, no cost: every answer is a plain filter/sort over the
// items you already have. Pure — see smartQuestions.test.ts.

import type { InventoryItem } from "@/lib/types";
import {
  daysUntil,
  itemValue,
  maintenanceState,
  warrantyState,
} from "@/lib/value";

export type SmartTone = "urgent" | "info" | "neutral";

export type SmartAnswer = {
  id: string;
  /** The question, phrased as its own answer heading. */
  label: string;
  emoji: string;
  tone: SmartTone;
  items: InventoryItem[];
};

const byValueDesc = (a: InventoryItem, b: InventoryItem) =>
  itemValue(b) - itemValue(a);

/**
 * Compute the answerable questions for the current catalog, most-actionable
 * first, omitting any with no matches (a calm surface never shows a wall of
 * "0"). `today` is passed in (YYYY-MM-DD) so it stays pure/testable. Operates on
 * active items only — archived/released things aren't what you're asking about.
 */
export function smartAnswers(
  items: InventoryItem[],
  today: string
): SmartAnswer[] {
  const active = items.filter((i) => !i.archived);

  const lent = active.filter((i) => i.lentTo?.trim());
  const overdue = lent.filter((i) => {
    const d = i.dueDate ? daysUntil(i.dueDate, today) : null;
    return d !== null && d < 0;
  });

  const answers: SmartAnswer[] = [
    {
      id: "return-overdue",
      label: "Overdue to come back",
      emoji: "⏰",
      tone: "urgent",
      items: overdue,
    },
    {
      id: "warranty-expired",
      label: "Warranty has ended",
      emoji: "🛡️",
      tone: "urgent",
      items: active.filter((i) => warrantyState(i, today) === "expired"),
    },
    {
      id: "warranty-soon",
      label: "Warranty ending soon",
      emoji: "🛡️",
      tone: "info",
      items: active.filter((i) => warrantyState(i, today) === "soon"),
    },
    {
      id: "upkeep-due",
      label: "Upkeep due soon",
      emoji: "🔧",
      tone: "info",
      items: active.filter((i) => {
        const m = maintenanceState(i, today);
        return m === "soon" || m === "overdue";
      }),
    },
    {
      id: "lent-out",
      label: "Lent out right now",
      emoji: "🤝",
      tone: "info",
      items: lent,
    },
    {
      id: "on-the-way-out",
      label: "On the way out",
      emoji: "✨",
      tone: "info",
      items: active.filter((i) => Boolean(i.disposition)),
    },
    {
      id: "unassigned",
      label: "No location yet",
      emoji: "📍",
      tone: "neutral",
      items: active.filter((i) => !i.locationId),
    },
    {
      id: "no-photo",
      label: "Not photographed yet",
      emoji: "📷",
      tone: "neutral",
      items: active.filter((i) => (i.photos?.length ?? 0) === 0),
    },
    {
      id: "most-valuable",
      label: "Most valuable",
      emoji: "💎",
      tone: "neutral",
      items: [...active]
        .filter((i) => itemValue(i) > 0)
        .sort(byValueDesc)
        .slice(0, 5),
    },
  ];

  return answers.filter((a) => a.items.length > 0);
}
