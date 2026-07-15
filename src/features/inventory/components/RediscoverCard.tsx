"use client";

import { Package, X } from "@/components/icons";
import type { InventoryItem } from "@/features/inventory/lib/types";
import { formatMoney, itemValue } from "@/features/inventory/lib/value";

type RediscoverCardProps = {
  item: InventoryItem;
  locationPath: string[];
  currency: string;
  onOpen: (item: InventoryItem) => void;
  onDismiss: () => void;
};

/**
 * A calm once-a-day nudge that resurfaces a forgotten item — a gentle prompt to
 * use it or let it go, not a notification. Dismiss hides it until tomorrow.
 */
export function RediscoverCard({
  item,
  locationPath,
  currency,
  onOpen,
  onDismiss,
}: RediscoverCardProps) {
  const photo = item.photos[0]?.url;
  const value = itemValue(item);
  const where =
    item.lentTo?.trim()
      ? `With ${item.lentTo.trim()}`
      : locationPath.length > 0
        ? locationPath.join(" › ")
        : "No location set";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-4 sm:p-5">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Not today"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
      >
        <X className="h-4 w-4" />
      </button>

      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        ✨ Rediscover
      </p>

      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-950/70">
          {photo ? (
            // Arbitrary user URLs aren't in next/image's allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Package className="h-6 w-6 text-slate-600" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-slate-100">
            {item.name}
          </span>
          <span className="block truncate text-xs text-slate-400">
            📍 {where}
            {value > 0 && (
              <span className="ml-1.5 text-emerald-300/90">
                · {formatMoney(value, currency)}
              </span>
            )}
          </span>
        </span>
      </button>

      <p className="mt-2.5 text-sm text-slate-400">
        Still need it? Still love it? Give it a use — or let it go.
      </p>
    </div>
  );
}

export default RediscoverCard;
