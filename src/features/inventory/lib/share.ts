// Pure helpers for sharing an item with a friend (Messages, WhatsApp, social)
// and, in passing, spreading the word about the app. No DOM/React here so the
// logic stays unit-testable; the component wires these to navigator.share /
// clipboard.

import { CONDITIONS, type InventoryItem } from "./types";

export const APP_NAME = "Bookmark Deck";

type ShareableItem = Pick<
  InventoryItem,
  "name" | "condition" | "category" | "storeUrl"
>;

/** A friendly, shareable blurb about an item + a gentle nudge to try the app. */
export function buildItemShareText(
  item: ShareableItem,
  appUrl?: string
): string {
  const lines: string[] = [];
  const cond = item.condition
    ? CONDITIONS.find((c) => c.id === item.condition)?.label ?? item.condition
    : null;
  const descr = [cond, item.category].filter(Boolean).join(" · ");
  lines.push(descr ? `${item.name} (${descr})` : item.name);
  if (item.storeUrl) lines.push(item.storeUrl);
  lines.push(
    appUrl
      ? `Shared from ${APP_NAME} — keep track of your things too: ${appUrl}`
      : `Shared from ${APP_NAME}.`
  );
  return lines.join("\n");
}

/** wa.me deep link — opens WhatsApp (web or app) with the message prefilled. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** sms: link — opens the device's Messages app with the body prefilled. */
export function smsShareUrl(text: string): string {
  return `sms:?&body=${encodeURIComponent(text)}`;
}
